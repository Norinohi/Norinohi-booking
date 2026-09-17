import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { normalizeSearchRow, searchColumns, type SearchRow } from "./columns";
import {
  decodeSearchCursor,
  encodeSearchCursor,
  type DecodedSearchCursor,
  type SearchCursor,
} from "./cursor";
import { whereClause } from "./filters";
import { localizeSearchDocs } from "./localize";
import {
  liftedForDates,
  NULL_YEAR_DESC,
  priceAscSortValue,
  priceAscSortValueOf,
  priceDescSortValue,
  priceDescSortValueOf,
  pricedForDates,
  pricedForDatesColumn,
  recommendedSortValueFor,
  recommendedSortValueOf,
  searchDocs,
  yearDescSortValue,
} from "./pricing-sql";
import { sellsRequestedPeriodColumn, temporaryHoldColumn } from "./sellable-starts";
import { pricedForNearestCharter } from "./short-charters";
import type {
  ListingSearchDoc,
  ListingSearchInput,
  ListingSearchPagination,
  ListingSearchResult,
  PriceBasis,
  SearchSort,
} from "./types";

export { listAvailabilityCalendar, listAvailabilityConstraints } from "./availability-constraints";
export { normalizeSearchRow, searchColumns, type SearchRow } from "./columns";
export {
  feeVariantKey,
  foldFeeVariants,
  listRequestableExtraPrices,
  listRequestableExtras,
  listSelectableExtraCodes,
  type RequestableExtraPrice,
} from "./extras";
export { listSearchFacets } from "./facets";
export { valueForLabel } from "./filters";
export {
  getListingByIdOrSlug,
  getListingDetailByIdOrSlug,
  getMergedListingTarget,
  listListingReviews,
  listSimilarListings,
} from "./listing-detail";
export { listMapMarinas } from "./map";
export { normalizedKey as normalizedFilterValue } from "./normalize";
export {
  comparablePrice,
  MIN_BASE_SHARE_OF_ALL_IN,
  nightlyPriceOf,
  priceAscSortValueOf,
  priceDescSortValueOf,
  recommendedSortValue,
  UNPRICED_CHARTER_SORT_OFFSET,
} from "./pricing-sql";
export { nextCharterAfterLapseColumns } from "./sellable-starts";
export { listShortCharterPeriods } from "./short-charters";
export { listSearchSuggestions } from "./suggestions";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 500;

export async function searchListings(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingSearchResult> {
  if (!input.cursor) return searchListingsByPage(db, input);

  const basis = input.priceBasis ?? "all_in";
  /* A price cursor from the other basis is a boundary in a sequence this query is not walking,
     so it is dropped and the reader starts again rather than being served a scrambled page. */
  const cursor = usableCursor(decodeSearchCursor(input.cursor), input.sort, basis);

  const limit = normalizedLimit(input.limit);
  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}${sellsRequestedPeriodColumn(input)}${temporaryHoldColumn(input)}${pricedForDatesColumn(input)}
    from ${searchDocs(input)} doc
    where ${whereClause(input)}
      and ${cursorClause(input.sort, cursor, basis, input)}
    order by ${orderClause(input.sort, basis, input)}
    limit ${limit + 1}
  `);

  const items = await localizeSearchDocs(
    db,
    await pricedForNearestCharter(db, input, rows.rows.slice(0, limit).map(normalizeSearchRow)),
    input.locale,
  );
  const last = items.at(-1);
  const hasNext = rows.rows.length > limit;

  return {
    items,
    nextCursor:
      hasNext && last ? encodeSearchCursor(cursorFor(last, input.sort, basis)) : undefined,
  };
}

async function searchListingsByPage(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingSearchResult> {
  const page = normalizedPage(input.page);
  const pageSize = normalizedLimit(input.pageSize ?? input.limit);
  const offset = (page - 1) * pageSize;
  const filters = whereClause(input);

  /* The total rides on the page query: a separate count repeated the whole availability filter,
     which is most of a dated search's cost. */
  const rows = await db.execute<SearchRow & { totalItems: number }>(sql`
    select count(*) over ()::integer as "totalItems",
      ${searchColumns}${sellsRequestedPeriodColumn(input)}${temporaryHoldColumn(input)}${pricedForDatesColumn(input)}
    from ${searchDocs(input)} doc
    where ${filters}
    order by ${orderClause(input.sort, input.priceBasis, input)}
    limit ${pageSize}
    offset ${offset}
  `);

  const totalItems =
    rows.rows[0]?.totalItems ??
    (offset === 0 ? 0 : await countMatches(db, searchDocs(input), filters));
  const pageRows = rows.rows.map(({ totalItems: _total, ...row }) => normalizeSearchRow(row));
  const items = await localizeSearchDocs(
    db,
    await pricedForNearestCharter(db, input, pageRows),
    input.locale,
  );

  return {
    items,
    pagination: paginationFor({ page, pageSize, totalItems, itemCount: items.length }),
  };
}

/** A page past the last one carries no row to read the window count from. */
async function countMatches(
  db: NodePgDatabase<typeof schema>,
  docs: SQL,
  filters: SQL,
): Promise<number> {
  const rows = await db.execute<{ totalItems: number }>(sql`
    select count(*)::integer as "totalItems"
    from ${docs} doc
    where ${filters}
  `);
  return rows.rows[0]?.totalItems ?? 0;
}

/**
 * Hydrates card-ready docs for an explicit id set (wishlist, bookings). Returns them
 * in the caller's `listingIds` order, and silently drops ids with no search doc —
 * a listing can be unpublished while it is still saved.
 */
export async function listListingsByIds(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[],
): Promise<ListingSearchDoc[]> {
  if (listingIds.length === 0) return [];

  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}
    from listing_search_doc doc
    where doc.listing_id in (${sql.join(
      listingIds.map((listingId) => sql`${listingId}`),
      sql`, `,
    )})
  `);

  const byId = new Map(rows.rows.map((row) => [row.listingId, normalizeSearchRow(row)]));
  return listingIds
    .map((listingId) => byId.get(listingId))
    .filter((doc): doc is ListingSearchDoc => doc !== undefined);
}

function cursorClause(
  sort: SearchSort = "recommended",
  cursor: DecodedSearchCursor | undefined,
  basis: PriceBasis | undefined,
  input: ListingSearchInput,
): SQL {
  if (!cursor) return sql`true`;

  switch (sort) {
    case "price-asc":
      return sql`(${priceAscSortValue(basis, pricedForDates(input))}, doc.listing_id) > (${Number(cursor.value)}, ${cursor.listingId})`;
    case "price-desc":
      return sql`(${priceDescSortValue(basis, liftedForDates(input))}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
    case "rating":
      return sql`(doc.rating, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
    case "recommended":
      return sql`(${recommendedSortValueFor(input)}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
    case "newest":
      return sql`(${yearDescSortValue}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
  }
}

function orderClause(
  sort: SearchSort = "recommended",
  basis: PriceBasis | undefined,
  input: ListingSearchInput,
): SQL {
  switch (sort) {
    case "price-asc":
      return sql`${priceAscSortValue(basis, pricedForDates(input))} asc, doc.listing_id asc`;
    case "price-desc":
      return sql`${priceDescSortValue(basis, liftedForDates(input))} desc, doc.listing_id desc`;
    case "rating":
      return sql`doc.rating desc, doc.listing_id desc`;
    case "recommended":
      return sql`${recommendedSortValueFor(input)} desc, doc.listing_id desc`;
    case "newest":
      return sql`${yearDescSortValue} desc, doc.listing_id desc`;
  }
}

/**
 * The cursor for the last row of a page.
 *
 * A price cursor carries the basis it was minted under. The two bases order the catalogue
 * differently, so a cursor from one is a boundary in the wrong sequence for the other: read
 * blind it would skip rows or serve them twice, exactly for the reader who happened to be
 * paging while an admin flipped the switch.
 */
function cursorFor(
  item: ListingSearchDoc,
  sort: SearchSort = "recommended",
  basis: PriceBasis = "all_in",
): SearchCursor {
  switch (sort) {
    case "price-asc":
      return {
        value: priceAscSortValueOf(item, basis),
        listingId: item.listingId,
        basis,
      };
    case "price-desc":
      return {
        value: priceDescSortValueOf(item, basis),
        listingId: item.listingId,
        basis,
      };
    case "newest":
      return { value: item.yearBuilt ?? NULL_YEAR_DESC, listingId: item.listingId };
    case "rating":
      return { value: item.rating, listingId: item.listingId };
    case "recommended":
      return { value: recommendedSortValueOf(item), listingId: item.listingId };
  }
}

/** A cursor is usable unless it was minted for a price ordering this request is not using. */
function usableCursor(
  cursor: DecodedSearchCursor | undefined,
  sort: SearchSort | undefined,
  basis: PriceBasis,
): DecodedSearchCursor | undefined {
  if (!cursor) return undefined;
  if (sort !== "price-asc" && sort !== "price-desc") return cursor;
  return (cursor.basis ?? "all_in") === basis ? cursor : undefined;
}

function normalizedLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function normalizedPage(page: number | undefined): number {
  return Math.max(page ?? 1, 1);
}

function paginationFor(input: {
  page: number;
  pageSize: number;
  totalItems: number;
  itemCount: number;
}): ListingSearchPagination {
  const totalPages = Math.max(Math.ceil(input.totalItems / input.pageSize), 1);
  const startItem = input.itemCount > 0 ? (input.page - 1) * input.pageSize + 1 : 0;
  const endItem = input.itemCount > 0 ? startItem + input.itemCount - 1 : 0;

  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems: input.totalItems,
    totalPages,
    startItem,
    endItem,
    hasPreviousPage: input.page > 1,
    hasNextPage: input.page < totalPages,
  };
}
