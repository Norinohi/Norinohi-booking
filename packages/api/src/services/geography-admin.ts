import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import { listing } from "@yacht-charter/db/schema/listing";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type { geographyOptionsInputSchema, geographyOptionsSchema } from "../contracts/route";

type Input = z.infer<typeof geographyOptionsInputSchema>;
type Options = z.infer<typeof geographyOptionsSchema>;

/**
 * The country → region → location → base hierarchy, flattened for a picker.
 *
 * `base` carries no country column — it reaches one through its location's region — so both
 * lists are joins rather than reads, and both are ordered by how much inventory sits behind
 * them. That order is the point: the client is authoring routes for the busiest bases first,
 * and an alphabetical list buries them among marinas with one yacht.
 *
 * Counts are of published listings. A draft is inventory that has not been reviewed, and a base
 * whose whole fleet is still in the import queue should not be presented as the busy one.
 */
export async function listGeographyOptions(db: Database, input: Input): Promise<Options> {
  const pattern = input.query ? `%${input.query}%` : null;

  const publishedListings = count(sql`case when ${listing.status} = 'published' then 1 end`);

  const regionFilters = [];
  if (input.countryId) regionFilters.push(eq(country.id, input.countryId));
  if (pattern) regionFilters.push(ilike(region.name, pattern));

  const baseFilters = [];
  if (input.countryId) baseFilters.push(eq(country.id, input.countryId));
  if (pattern) baseFilters.push(or(ilike(base.name, pattern), ilike(location.name, pattern)));

  const [countries, regions, bases] = await Promise.all([
    db
      .select({ id: country.id, code: country.code, name: country.name })
      .from(country)
      .orderBy(asc(country.name)),

    db
      .select({
        id: region.id,
        name: region.name,
        countryId: country.id,
        countryName: country.name,
        listingCount: publishedListings,
      })
      .from(region)
      .innerJoin(country, eq(country.id, region.countryId))
      .leftJoin(location, eq(location.regionId, region.id))
      .leftJoin(base, eq(base.locationId, location.id))
      .leftJoin(listing, eq(listing.homeBaseId, base.id))
      .where(regionFilters.length > 0 ? and(...regionFilters) : undefined)
      .groupBy(region.id, region.name, country.id, country.name)
      .orderBy(desc(publishedListings), asc(region.name))
      .limit(input.limit),

    db
      .select({
        id: base.id,
        name: base.name,
        locationName: location.name,
        regionId: region.id,
        regionName: region.name,
        countryId: country.id,
        countryName: country.name,
        lat: base.lat,
        lng: base.lng,
        listingCount: publishedListings,
      })
      .from(base)
      .innerJoin(location, eq(location.id, base.locationId))
      .innerJoin(region, eq(region.id, location.regionId))
      .innerJoin(country, eq(country.id, region.countryId))
      .leftJoin(listing, eq(listing.homeBaseId, base.id))
      .where(baseFilters.length > 0 ? and(...baseFilters) : undefined)
      .groupBy(
        base.id,
        base.name,
        base.lat,
        base.lng,
        location.name,
        region.id,
        region.name,
        country.id,
        country.name,
      )
      .orderBy(desc(publishedListings), asc(base.name))
      .limit(input.limit),
  ]);

  return { countries, regions, bases };
}
