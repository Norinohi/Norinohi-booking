import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { newId } from "../schema/_shared";

type Database = NodePgDatabase<typeof schema>;
export type DatabaseExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Where a projection now puts a base row that already exists. */
export type BasePlacement = {
  baseId: string;
  countryCode: string;
  regionName: string;
  locationName: string;
  city: string | null;
  baseName: string;
};

export type BaseRelocation = {
  baseId: string;
  countryCode: string;
  from: { region: string; location: string; base: string };
  to: { region: string; location: string; base: string };
  /** The base already at the destination under that name, which takes this one's references. */
  mergedInto: string | null;
};

export type BaseRelocationReport = {
  relocations: BaseRelocation[];
  unchanged: number;
  citiesFilled: number;
  /** Placements whose base row or country no longer exists. */
  skipped: string[];
  /** The locations the relocated bases left, for `pruneEmptyGeography`. */
  vacatedLocationIds: string[];
  /** Listings moored at a relocated base, whose search documents now name the wrong place. */
  affectedListingIds: string[];
};

type CurrentPlace = {
  base_id: string;
  base_name: string;
  location_id: string;
  location_name: string;
  city: string | null;
  region_name: string;
  country_id: string;
};

const idList = (ids: readonly string[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/**
 * Moves existing base rows to where a projection now places them, keeping their ids.
 *
 * The catalogue writer finds a base by location and name, so a projection that renames a region
 * would otherwise insert a second base at the new place and move the boats onto it, leaving
 * behind the row every suggested route is attached to. Moving the row in place keeps those.
 * Where the destination already holds a base of the same name the two are one marina, so the
 * references move to the existing row and the old one is deleted.
 *
 * Writes through `db` as given: run it inside a transaction and roll back for a dry run.
 */
export async function relocateBases(
  db: DatabaseExecutor,
  placements: readonly BasePlacement[],
): Promise<BaseRelocationReport> {
  const report: BaseRelocationReport = {
    relocations: [],
    unchanged: 0,
    citiesFilled: 0,
    skipped: [],
    vacatedLocationIds: [],
    affectedListingIds: [],
  };
  if (placements.length === 0) return report;

  const current = await db.execute<CurrentPlace>(sql`
    select b.id as base_id, b.name as base_name, l.id as location_id, l.name as location_name,
      l.city, r.name as region_name, r.country_id
    from base b
    join location l on l.id = b.location_id
    join region r on r.id = l.region_id
    where b.id in (${idList(placements.map((item) => item.baseId))})
  `);
  const currentById = new Map(current.rows.map((row) => [row.base_id, row]));

  const countries = await db.execute<{ id: string; code: string }>(
    sql`select id, code from country`,
  );
  const countryIdByCode = new Map(countries.rows.map((row) => [row.code, row.id]));

  const vacated = new Set<string>();
  const relocatedBaseIds: string[] = [];

  for (const placement of placements) {
    const place = currentById.get(placement.baseId);
    const countryId = countryIdByCode.get(placement.countryCode);
    if (place === undefined || countryId === undefined) {
      report.skipped.push(placement.baseId);
      continue;
    }

    const unchanged =
      place.country_id === countryId &&
      place.region_name === placement.regionName &&
      place.location_name === placement.locationName &&
      place.base_name === placement.baseName;

    if (unchanged) {
      report.unchanged += 1;
      if (place.city === null && placement.city !== null) {
        await db.execute(
          sql`update location set city = ${placement.city}, updated_at = now() where id = ${place.location_id} and city is null`,
        );
        report.citiesFilled += 1;
      }
      continue;
    }

    const regionId = await ensureRegion(db, countryId, placement.regionName);
    const locationId = await ensureLocation(db, regionId, placement.locationName, placement.city);

    const existing = await db.execute<{ id: string }>(sql`
      select id from base
      where location_id = ${locationId} and name = ${placement.baseName} and id <> ${placement.baseId}
      limit 1
    `);
    const mergedInto = existing.rows[0]?.id ?? null;

    report.relocations.push({
      baseId: placement.baseId,
      countryCode: placement.countryCode,
      from: { region: place.region_name, location: place.location_name, base: place.base_name },
      to: {
        region: placement.regionName,
        location: placement.locationName,
        base: placement.baseName,
      },
      mergedInto,
    });
    relocatedBaseIds.push(placement.baseId);
    if (mergedInto !== null) relocatedBaseIds.push(mergedInto);
    vacated.add(place.location_id);

    if (mergedInto === null) {
      await db.execute(sql`
        update base set location_id = ${locationId}, name = ${placement.baseName}, updated_at = now()
        where id = ${placement.baseId}
      `);
      continue;
    }

    await db.execute(
      sql`update listing set home_base_id = ${mergedInto} where home_base_id = ${placement.baseId}`,
    );
    await db.execute(
      sql`update listing_offer set home_base_id = ${mergedInto} where home_base_id = ${placement.baseId}`,
    );
    await db.execute(
      sql`update suggested_route set base_id = ${mergedInto} where base_id = ${placement.baseId}`,
    );
    await db.execute(
      sql`update base_source set base_id = ${mergedInto}, updated_at = now() where base_id = ${placement.baseId}`,
    );
    await db.execute(sql`delete from base where id = ${placement.baseId}`);
  }

  report.vacatedLocationIds = [...vacated];
  if (relocatedBaseIds.length > 0) {
    const listings = await db.execute<{ id: string }>(sql`
      select id from listing where home_base_id in (${idList(relocatedBaseIds)})
      union
      select listing_id from listing_offer where home_base_id in (${idList(relocatedBaseIds)})
    `);
    report.affectedListingIds = listings.rows.map((row) => row.id);
  }
  return report;
}

async function ensureRegion(db: DatabaseExecutor, countryId: string, name: string) {
  const rows = await db.execute<{ id: string }>(sql`
    with created as (
      insert into region (id, country_id, name)
      values (${newId("rgn")}, ${countryId}, ${name})
      on conflict (country_id, name) do nothing
      returning id
    )
    select id from created
    union all
    select id from region where country_id = ${countryId} and name = ${name}
    limit 1
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error(`Region ${name} could not be created`);
  return id;
}

/* A town the vendor states fills an empty `city`, and never replaces one somebody curated. */
async function ensureLocation(
  db: DatabaseExecutor,
  regionId: string,
  name: string,
  city: string | null,
) {
  const rows = await db.execute<{ id: string }>(sql`
    with created as (
      insert into location (id, region_id, name, city)
      values (${newId("loc")}, ${regionId}, ${name}, ${city})
      on conflict (region_id, name) do update
        set city = excluded.city, updated_at = now()
        where location.city is null and excluded.city is not null
      returning id
    )
    select id from created
    union all
    select id from location where region_id = ${regionId} and name = ${name}
    limit 1
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error(`Location ${name} could not be created`);
  return id;
}

export type GeographyPruneReport = { bases: number; locations: number; regions: number };

/**
 * Deletes the geography nothing stands on any more, inside the given scope.
 *
 * The scope is the world regions a provider once filed countries under and the locations a
 * relocation vacated. A base goes only when no listing, offer or route points at it, a location
 * only once it holds no base, and a region only once it holds no location and carries no route:
 * a suggested route cascades with its region, so a region somebody wrote a route for is kept
 * even empty.
 *
 * `keepBound` also keeps every base a provider is bound to (`base_source`). A catalogue sync
 * passes it: a base its vendor still states is not stale for having no boat yet, and deleting it
 * would take the binding with it and write the row again under a new id on the next sync.
 */
export async function pruneEmptyGeography(
  db: DatabaseExecutor,
  scope: { regionNames: readonly string[]; locationIds: readonly string[]; keepBound?: boolean },
): Promise<GeographyPruneReport> {
  const byRegionName =
    scope.regionNames.length === 0
      ? sql`false`
      : sql`r.name in (${sql.join(
          scope.regionNames.map((name) => sql`${name}`),
          sql`, `,
        )})`;
  const byLocation =
    scope.locationIds.length === 0 ? sql`false` : sql`l.id in (${idList(scope.locationIds)})`;

  const scoped = await db.execute<{ location_id: string; region_id: string }>(sql`
    select l.id as location_id, l.region_id
    from location l
    join region r on r.id = l.region_id
    where ${byRegionName} or ${byLocation}
  `);
  const regionsInScope = await db.execute<{ id: string }>(sql`
    select r.id from region r where ${byRegionName}
  `);
  const locationIds = scoped.rows.map((row) => row.location_id);
  const regionIds = [
    ...new Set([
      ...scoped.rows.map((row) => row.region_id),
      ...regionsInScope.rows.map((row) => row.id),
    ]),
  ];

  let bases = 0;
  let locations = 0;
  if (locationIds.length > 0) {
    const deletedBases = await db.execute<{ id: string }>(sql`
      delete from base b
      where b.location_id in (${idList(locationIds)})
        and not exists (select 1 from listing where home_base_id = b.id)
        and not exists (select 1 from listing_offer where home_base_id = b.id)
        and not exists (select 1 from suggested_route where base_id = b.id)
        and (${scope.keepBound !== true} or not exists (select 1 from base_source where base_id = b.id))
      returning b.id
    `);
    bases = deletedBases.rows.length;

    const deletedLocations = await db.execute<{ id: string }>(sql`
      delete from location l
      where l.id in (${idList(locationIds)})
        and not exists (select 1 from base where location_id = l.id)
      returning l.id
    `);
    locations = deletedLocations.rows.length;
  }

  let regions = 0;
  if (regionIds.length > 0) {
    const deletedRegions = await db.execute<{ id: string }>(sql`
      delete from region r
      where r.id in (${idList(regionIds)})
        and not exists (select 1 from location where region_id = r.id)
        and not exists (select 1 from suggested_route where region_id = r.id)
      returning r.id
    `);
    regions = deletedRegions.rows.length;
  }

  return { bases, locations, regions };
}
