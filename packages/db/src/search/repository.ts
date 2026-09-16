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
import { valueForLabel, whereClause } from "./filters";
import { localizeSearchDocs } from "./localize";
import { normalizedKeySql as normalizedSql } from "./normalize";
import {
  liftedForDates,
  NULL_YEAR_DESC,
  priceAscSortValue,
  priceAscSortValueOf,
  priceDescSortValue,
  priceDescSortValueOf,
  pricedForDates,
  pricedForDatesColumn,
  recommendedSortValue,
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
  ListingSuggestion,
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

  const [rows, countRows] = await Promise.all([
    db.execute<SearchRow>(sql`
      select ${searchColumns}${sellsRequestedPeriodColumn(input)}${temporaryHoldColumn(input)}${pricedForDatesColumn(input)}
      from ${searchDocs(input)} doc
      where ${filters}
      order by ${orderClause(input.sort, input.priceBasis, input)}
      limit ${pageSize}
      offset ${offset}
    `),
    db.execute<{ totalItems: number }>(sql`
      select count(*)::integer as "totalItems"
      from ${searchDocs(input)} doc
      where ${filters}
    `),
  ]);

  const totalItems = countRows.rows[0]?.totalItems ?? 0;
  const items = await localizeSearchDocs(
    db,
    await pricedForNearestCharter(db, input, rows.rows.map(normalizeSearchRow)),
    input.locale,
  );

  return {
    items,
    pagination: paginationFor({ page, pageSize, totalItems, itemCount: items.length }),
  };
}

/*
 * How many countries the empty typeahead offers. Eight rather than the five it used to show,
 * because that is the length of the curated list it now leads with.
 */
const POPULAR_SUGGESTION_LIMIT = 8;

export async function listSearchSuggestions(
  db: NodePgDatabase<typeof schema>,
  query: string,
): Promise<ListingSuggestion[]> {
  /*
   * Empty field: seed the typeahead with the popular countries so the user has somewhere to
   * start, instead of an alphabetical slice that means nothing.
   *
   * Curated order first, then the most-stocked, and the fallback is the point of the join being
   * a left one: until somebody opens the admin screen no country carries a rank, and this
   * answers exactly what it always did. Grouped off listing_search_doc either way, so a curated
   * country with nothing in stock is not offered.
   */
  if (query.trim() === "") {
    const popular = await db.execute<Omit<ListingSuggestion, "value">>(sql`
      select
        doc.country as label,
        'country' as kind,
        bool_or(media.popular_rank is not null) as popular
      from listing_search_doc doc
      left join facet_media media
        on media.kind = 'country'
        and ${normalizedSql(sql`media.value`)} = ${normalizedSql(sql`doc.country`)}
        and media.popular_rank is not null
      where doc.country is not null
      group by doc.country
      order by min(media.popular_rank) asc nulls last, count(*) desc, doc.country asc
      limit ${POPULAR_SUGGESTION_LIMIT}
    `);
    return popular.rows.map(withFilterValue);
  }

  const pattern = `%${query}%`;
  const rows = await db.execute<Omit<ListingSuggestion, "value">>(sql`
    select distinct label, kind
    from (
      select doc.country as label, 'country' as kind from listing_search_doc doc
      union all
      select doc.region as label, 'region' as kind from listing_search_doc doc
      union all
      select doc.location as label, 'location' as kind from listing_search_doc doc
      union all
      select doc.base_name as label, 'base' as kind from listing_search_doc doc
    ) suggestions
    where label ilike ${pattern}
    order by label asc
    limit 10
  `);

  return rows.rows.map(withFilterValue);
}

/*
 * Derived here rather than selected in SQL because it has to be the *same* derivation the facet
 * options use -- a suggestion whose value did not match its facet option would set a filter the
 * panel could not show as ticked.
 */
function withFilterValue(row: Omit<ListingSuggestion, "value">): ListingSuggestion {
  return { ...row, value: valueForLabel(row.label) };
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
      return sql`(${recommendedSortValue}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
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
      return sql`${recommendedSortValue} desc, doc.listing_id desc`;
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
      /* The same expression as `recommendedSortValue`, in the units the cursor compares. */
      return {
        value: (item.priceIsFrom ? 0 : 10) + Number(item.rating),
        listingId: item.listingId,
      };
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
