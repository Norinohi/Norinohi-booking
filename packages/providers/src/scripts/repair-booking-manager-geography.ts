/**
 * Moves Booking Manager bases already in the catalogue to the regions the projection now picks.
 *
 * The projection used to file every Booking Manager base under its country's world region
 * ("Southern Europe"), and migration 0128 then under its sailing area ("Split"). It now places a
 * base into the region the NauSYS boats around it already sail from ("Split region"), with the
 * base's town as its location. Left to the nightly sync that change would create a second base
 * row at the new place and move the boats onto it, stranding every suggested route attached to
 * the old one. This moves the rows in place from the stored payloads instead, with no vendor call:
 *
 *   pnpm --filter @yacht-charter/providers geography:repair-bm            # dry run
 *   pnpm --filter @yacht-charter/providers geography:repair-bm --list     # dry run, every base
 *   pnpm --filter @yacht-charter/providers geography:repair-bm --apply
 *
 * It then deletes the bases, locations and world regions nothing stands on any more, and rebuilds
 * the search documents of the boats it moved. The dry run does all of it inside a transaction
 * that is rolled back, so its counts are the real ones.
 *
 * The catalogue sync now does the same itself for every base bound to a row (`base_source`,
 * backfilled from the boats by migration 0152), so this only re-places bases now, from the
 * stored payloads, rather than at the next sync.
 */
import { db } from "@yacht-charter/db";
import { listReferenceRegions } from "@yacht-charter/db/geo/reference-regions";
import {
  pruneEmptyGeography,
  relocateBases,
  type BasePlacement,
  type BaseRelocationReport,
  type GeographyPruneReport,
} from "@yacht-charter/db/geo/relocate-bases";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import {
  provider as providerTable,
  providerRawPayload,
  providerRecord,
} from "@yacht-charter/db/schema/provider";
import { rebuildListingSearchDocsForListings } from "@yacht-charter/db/search/read-model";
import { and, eq, inArray, isNotNull, TransactionRollbackError } from "drizzle-orm";

import { restWorldRegionSchema } from "../booking-manager/endpoints";
import { projectBookingManagerGeography } from "../booking-manager/projection";
import { parseAll, text } from "../shared/projection-helpers";
import { revalidateCatalogCache } from "../sync/revalidate";
import type { ProviderRecordSet, ProviderResourceType } from "../types";

const apply = process.argv.includes("--apply");
const listEach = process.argv.includes("--list");

const GEOGRAPHY_RESOURCES: ProviderResourceType[] = ["country", "region", "location", "base"];

async function loadGeographyRecords(providerId: string): Promise<ProviderRecordSet> {
  const rows = await db
    .select({
      resourceType: providerRecord.resourceType,
      externalId: providerRecord.externalId,
      payload: providerRawPayload.payload,
    })
    .from(providerRecord)
    .innerJoin(providerRawPayload, eq(providerRawPayload.id, providerRecord.rawPayloadId))
    .where(
      and(
        eq(providerRecord.providerId, providerId),
        eq(providerRecord.active, true),
        inArray(providerRecord.resourceType, GEOGRAPHY_RESOURCES),
      ),
    );

  const records: ProviderRecordSet = new Map();
  for (const row of rows) {
    const bucket = records.get(row.resourceType) ?? [];
    bucket.push({ externalId: row.externalId, payload: row.payload });
    records.set(row.resourceType, bucket);
  }
  return records;
}

/** Where the projection puts each vendor base, keyed by the vendor's base id. */
async function placementsByExternalBase(records: ProviderRecordSet, providerId: string) {
  const referenceRegions = await listReferenceRegions(db, providerId);
  const geography = projectBookingManagerGeography(records, { referenceRegions });
  const countryCode = new Map(geography.countries.map((item) => [item.externalId, item.code]));
  const regionById = new Map(geography.regions.map((item) => [item.externalId, item]));
  const locationById = new Map(geography.locations.map((item) => [item.externalId, item]));

  const placements = new Map<string, Omit<BasePlacement, "baseId">>();
  for (const item of geography.bases) {
    const location = locationById.get(item.externalLocationId);
    const region = location === undefined ? undefined : regionById.get(location.externalRegionId);
    const code = region === undefined ? undefined : countryCode.get(region.externalCountryId);
    if (location === undefined || region === undefined || code === undefined) continue;
    placements.set(item.externalId, {
      countryCode: code,
      regionName: region.name,
      locationName: location.name,
      city: location.city ?? null,
      baseName: item.name,
    });
  }
  return { placements, referenceRegionCount: referenceRegions.length };
}

function printReport(relocation: BaseRelocationReport, pruned: GeographyPruneReport) {
  const moves = new Map<string, number>();
  for (const item of relocation.relocations) {
    const key = `${item.countryCode}  ${item.from.region}  ->  ${item.to.region}`;
    moves.set(key, (moves.get(key) ?? 0) + 1);
  }
  if (listEach) {
    for (const item of relocation.relocations) {
      const merged = item.mergedInto === null ? "" : `  (merged into ${item.mergedInto})`;
      console.log(
        `  ${item.countryCode}  ${item.from.region} / ${item.from.location} / ${item.from.base}  ->  ` +
          `${item.to.region} / ${item.to.location} / ${item.to.base}${merged}`,
      );
    }
  }
  console.log("\nBases moved, by country and region:");
  for (const [key, total] of [...moves.entries()].sort()) {
    console.log(`  ${String(total).padStart(4)}  ${key}`);
  }

  const merged = relocation.relocations.filter((item) => item.mergedInto !== null).length;
  console.log(
    `\nmoved ${relocation.relocations.length} (${merged} merged into an existing base of the same name), ` +
      `unchanged ${relocation.unchanged}, skipped ${relocation.skipped.length}, ` +
      `cities filled in place ${relocation.citiesFilled}`,
  );
  console.log(`listings to rebuild: ${relocation.affectedListingIds.length}`);
  console.log(
    `deleted as unreferenced: ${pruned.bases} bases, ${pruned.locations} locations, ${pruned.regions} regions`,
  );
}

async function main(): Promise<void> {
  const [row] = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, "booking_manager"))
    .limit(1);
  if (!row) throw new Error("Provider booking_manager is not registered");

  const records = await loadGeographyRecords(row.id);
  const { placements, referenceRegionCount } = await placementsByExternalBase(records, row.id);
  const worldRegionNames = [
    ...new Set(
      parseAll(records, "region", restWorldRegionSchema)
        .map((item) => text(item.name))
        .filter((name): name is string => name !== undefined),
    ),
  ];
  console.log(
    `${placements.size} vendor bases placed against ${referenceRegionCount} reference regions; ` +
      `${worldRegionNames.length} world region names in scope for cleanup`,
  );

  const moored = await db
    .selectDistinct({
      externalBaseId: listingSource.externalBaseId,
      baseId: listingOffer.homeBaseId,
    })
    .from(listingOffer)
    .innerJoin(listingSource, eq(listingSource.id, listingOffer.listingSourceId))
    .where(
      and(
        eq(listingOffer.providerId, row.id),
        isNotNull(listingOffer.homeBaseId),
        isNotNull(listingSource.externalBaseId),
      ),
    );

  const baseRows: BasePlacement[] = [];
  let unplaced = 0;
  for (const item of moored) {
    const placement =
      item.externalBaseId === null ? undefined : placements.get(item.externalBaseId);
    if (placement === undefined || item.baseId === null) {
      unplaced += 1;
      continue;
    }
    baseRows.push({ baseId: item.baseId, ...placement });
  }
  console.log(
    `${baseRows.length} base rows carry Booking Manager boats; ${unplaced} not placeable`,
  );

  let relocation: BaseRelocationReport | undefined;
  try {
    await db.transaction(async (tx) => {
      relocation = await relocateBases(tx, baseRows);
      const pruned = await pruneEmptyGeography(tx, {
        regionNames: worldRegionNames,
        locationIds: relocation.vacatedLocationIds,
      });
      printReport(relocation, pruned);
      if (!apply) tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
    console.log("\nDry run: rolled back. Pass --apply to write.");
    return;
  }

  const listingIds = relocation?.affectedListingIds ?? [];
  await rebuildListingSearchDocsForListings(db, listingIds);
  console.log(`rebuilt ${listingIds.length} search documents`);
  await revalidateCatalogCache();
}

/* A catch binding rather than a handler parameter, so nothing has to accept an `unknown`. */
try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
