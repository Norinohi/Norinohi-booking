import { facetMedia } from "@yacht-charter/db/schema/facet-media";
import { normalizedFilterValue } from "@yacht-charter/db/search/index";
import { and, asc, eq, isNotNull } from "drizzle-orm";

import type { DatabaseExecutor } from "../context";

/**
 * The curated amenity order, keyed the way the equipment facet keys its options.
 *
 * One small read rather than an ordering inside the search query. Ordering the amenity array in
 * SQL was the obvious alternative and measured ~10ms on a twenty-row page -- paid on every search,
 * the hottest query in the app -- because it normalizes both sides of a join once per amenity per
 * row. Reading the eighteen ranked values once and sorting in memory costs one indexed lookup per
 * request instead.
 *
 * Not memoized. `getMarketplaceSettings` reads its row per request for the same reason: an
 * editor's save has to be visible on the next request rather than whenever a cache decides, and
 * this table is small enough that the read does not earn a staleness window.
 */
export async function getAmenityRanks(db: DatabaseExecutor): Promise<Map<string, number>> {
  const rows = await db
    .select({ value: facetMedia.value, rank: facetMedia.popularRank })
    .from(facetMedia)
    .where(and(eq(facetMedia.kind, "equipment"), isNotNull(facetMedia.popularRank)))
    .orderBy(asc(facetMedia.popularRank));

  const byKey = new Map<string, number>();
  for (const row of rows) {
    /* `isNotNull` above already excludes these; the check is for the type, not the data. */
    if (row.rank === null) continue;
    /* Two spellings that normalize alike are one facet option, so the better-ranked wins rather
       than whichever the scan reached last. */
    const existing = byKey.get(normalizedFilterValue(row.value));
    if (existing === undefined || row.rank < existing) {
      byKey.set(normalizedFilterValue(row.value), row.rank);
    }
  }

  return byKey;
}
