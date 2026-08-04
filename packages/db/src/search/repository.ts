import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from "./cursor";
import type {
  AvailabilityCalendar,
  AvailabilityCalendarInput,
  ListingFacets,
  ListingMapMarker,
  ListingSearchDoc,
  ListingSearchInput,
  ListingSearchPagination,
  ListingSearchResult,
  ListingSuggestion,
  SearchSort,
} from "./types";

type SearchRow = ListingSearchDoc;

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const NULL_PRICE_ASC = 2_147_483_647;
const NULL_PRICE_DESC = -1;
const NULL_YEAR_DESC = 0;

export async function searchListings(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingSearchResult> {
  if (input.page) return searchListingsByPage(db, input);

  const limit = normalizedLimit(input.limit);
  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}
    from listing_search_doc doc
    where ${whereClause(input)}
      and ${cursorClause(input.sort, decodeSearchCursor(input.cursor))}
    order by ${orderClause(input.sort)}
    limit ${limit + 1}
  `);

  const items = rows.rows.slice(0, limit).map(normalizeSearchRow);
  const last = items.at(-1);
  const hasNext = rows.rows.length > limit;

  return {
    items,
    nextCursor: hasNext && last ? encodeSearchCursor(cursorFor(last, input.sort)) : undefined,
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
      select ${searchColumns}
      from listing_search_doc doc
      where ${filters}
      order by ${orderClause(input.sort)}
      limit ${pageSize}
      offset ${offset}
    `),
    db.execute<{ totalItems: number }>(sql`
      select count(*)::integer as "totalItems"
      from listing_search_doc doc
      where ${filters}
    `),
  ]);

  const totalItems = countRows.rows[0]?.totalItems ?? 0;
  const items = rows.rows.map(normalizeSearchRow);

  return {
    items,
    pagination: paginationFor({ page, pageSize, totalItems, itemCount: items.length }),
  };
}

export async function getListingByIdOrSlug(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
): Promise<ListingSearchDoc | undefined> {
  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}
    from listing_search_doc doc
    where doc.listing_id = ${idOrSlug} or doc.slug = ${idOrSlug}
    limit 1
  `);
  return rows.rows[0] ? normalizeSearchRow(rows.rows[0]) : undefined;
}

export async function listSearchFacets(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput = {},
): Promise<ListingFacets> {
  const rows = await db.execute<{
    destinations: string[];
    categories: string[];
    amenities: string[];
    minMinor: number | null;
    maxMinor: number | null;
    currency: string | null;
  }>(sql`
    select
      coalesce(jsonb_agg(distinct doc.country) filter (where doc.country is not null), '[]'::jsonb) as destinations,
      coalesce(jsonb_agg(distinct doc.category) filter (where doc.category is not null), '[]'::jsonb) as categories,
      coalesce(jsonb_agg(distinct amenity.value) filter (where amenity.value is not null), '[]'::jsonb) as amenities,
      min(doc.price_from_minor) as "minMinor",
      max(doc.price_from_minor) as "maxMinor",
      coalesce(min(doc.currency), ${input.currency ?? "EUR"}) as currency
    from listing_search_doc doc
    left join lateral jsonb_array_elements_text(doc.amenities) amenity(value) on true
    where ${whereClause(input)}
  `);
  const row = rows.rows[0];

  return {
    destinations: sortedStrings(row?.destinations),
    categories: sortedStrings(row?.categories),
    amenities: sortedStrings(row?.amenities),
    priceRange: {
      minMinor: row?.minMinor ?? 0,
      maxMinor: row?.maxMinor ?? 0,
      currency: row?.currency ?? input.currency ?? "EUR",
    },
  };
}

export async function listMapMarkers(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingMapMarker[]> {
  const rows = await db.execute<ListingMapMarker>(sql`
    select
      doc.listing_id as "listingId",
      doc.slug,
      doc.title,
      doc.lat,
      doc.lng,
      doc.price_from_minor as "priceFromMinor",
      doc.currency
    from listing_search_doc doc
    where ${whereClause(input)}
      and doc.lat is not null
      and doc.lng is not null
    order by doc.country asc, doc.region asc, doc.location asc, doc.title asc
    limit ${normalizedLimit(input.limit ?? 50)}
  `);

  return rows.rows;
}

export async function listSearchSuggestions(
  db: NodePgDatabase<typeof schema>,
  query: string,
): Promise<ListingSuggestion[]> {
  const pattern = `%${query}%`;
  const rows = await db.execute<ListingSuggestion>(sql`
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

  return rows.rows;
}

export async function listAvailabilityCalendar(
  db: NodePgDatabase<typeof schema>,
  input: AvailabilityCalendarInput,
): Promise<AvailabilityCalendar> {
  const rows = await db.execute<{
    startDate: string;
    endDate: string;
    status: "available" | "option" | "occupied" | "blocked";
    priceMinor: number | null;
    currency: string | null;
    minNights: number | null;
    checkinWeekday: number | null;
    checkoutWeekday: number | null;
  }>(sql`
    select
      slot.start_date as "startDate",
      slot.end_date as "endDate",
      slot.status,
      slot.price_minor as "priceMinor",
      slot.currency,
      slot.min_nights as "minNights",
      slot.checkin_weekday as "checkinWeekday",
      slot.checkout_weekday as "checkoutWeekday"
    from availability_slot slot
    where slot.listing_id = ${input.listingId}
      and slot.start_date >= ${input.from}
      and slot.end_date <= ${input.to}
      and (slot.currency is null or slot.currency = ${input.currency ?? "EUR"})
    order by slot.start_date asc, slot.end_date asc
  `);

  return {
    listingId: input.listingId,
    slots: rows.rows.map((slot) => ({
      startDate: slot.startDate,
      endDate: slot.endDate,
      status: slot.status,
      price:
        slot.priceMinor !== null && slot.currency
          ? { amountMinor: slot.priceMinor, currency: slot.currency }
          : undefined,
      minNights: slot.minNights,
      checkinWeekday: slot.checkinWeekday,
      checkoutWeekday: slot.checkoutWeekday,
    })),
  };
}

export async function listListingReviews(db: NodePgDatabase<typeof schema>, listingId: string) {
  const rows = await db.execute<{
    id: string;
    rating: number;
    author: string | null;
    body: string | null;
  }>(sql`
    select id, rating, author, body
    from review
    where listing_id = ${listingId}
    order by created_at desc
    limit 20
  `);

  return rows.rows.map((review) => ({
    id: review.id,
    rating: review.rating,
    author: review.author ?? "Guest",
    body: review.body ?? "",
  }));
}

export async function listSimilarListings(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  limit = 3,
): Promise<ListingSearchDoc[]> {
  const listing = await getListingByIdOrSlug(db, listingId);
  if (!listing) return [];

  const rows = await db.execute<SearchRow>(sql`
    select ${searchColumns}
    from listing_search_doc doc
    where doc.listing_id <> ${listing.listingId}
      and (
        doc.category = ${listing.category}
        or doc.country = ${listing.country}
        or doc.region = ${listing.region}
      )
    order by doc.rating desc, doc.price_from_minor asc nulls last, doc.listing_id asc
    limit ${limit}
  `);

  return rows.rows.map(normalizeSearchRow);
}

const searchColumns = sql`
  doc.listing_id as "listingId",
  doc.slug,
  doc.title,
  doc.category,
  doc.builder,
  doc.model,
  doc.operator,
  doc.base_id as "baseId",
  doc.base_name as "baseName",
  doc.location,
  doc.region,
  doc.country,
  doc.lat,
  doc.lng,
  doc.length_m as "lengthM",
  doc.cabins,
  doc.berths,
  doc.heads,
  doc.year_built as "yearBuilt",
  doc.rating,
  doc.review_count as "reviewCount",
  doc.main_image as "mainImage",
  doc.gallery,
  doc.amenities,
  doc.price_from_minor as "priceFromMinor",
  doc.currency,
  doc.available_from as "availableFrom",
  doc.available_to as "availableTo"
`;

function whereClause(input: ListingSearchInput): SQL {
  const parts: SQL[] = [sql`true`];
  if (input.destination) {
    const pattern = `%${input.destination}%`;
    parts.push(sql`(
      doc.country ilike ${pattern}
      or doc.region ilike ${pattern}
      or doc.location ilike ${pattern}
      or doc.base_name ilike ${pattern}
    )`);
  }
  if (input.query) parts.push(sql`doc.searchable_text ilike ${`%${input.query}%`}`);
  if (input.category) parts.push(sql`doc.category = ${input.category}`);
  if (input.minCabins) parts.push(sql`doc.cabins >= ${input.minCabins}`);
  if (input.guests) parts.push(sql`doc.berths >= ${input.guests}`);
  if (input.maxPriceMinor) parts.push(sql`doc.price_from_minor <= ${input.maxPriceMinor}`);
  if (input.currency) parts.push(sql`doc.currency = ${input.currency}`);
  if (input.checkIn && input.checkOut) {
    parts.push(sql`exists (
      select 1
      from availability_slot slot
      where slot.listing_id = doc.listing_id
        and slot.status = 'available'
        and slot.start_date <= ${input.checkIn}
        and slot.end_date >= ${input.checkOut}
    )`);
  }
  return sql.join(parts, sql` and `);
}

function cursorClause(sort: SearchSort = "recommended", cursor: SearchCursor | undefined): SQL {
  if (!cursor) return sql`true`;

  switch (sort) {
    case "price-asc":
      return sql`(${priceAscSortValue}, doc.listing_id) > (${Number(cursor.value)}, ${cursor.listingId})`;
    case "price-desc":
      return sql`(${priceDescSortValue}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
    case "rating":
    case "recommended":
      return sql`(doc.rating, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
    case "newest":
      return sql`(${yearDescSortValue}, doc.listing_id) < (${Number(cursor.value)}, ${cursor.listingId})`;
  }
}

function orderClause(sort: SearchSort = "recommended"): SQL {
  switch (sort) {
    case "price-asc":
      return sql`${priceAscSortValue} asc, doc.listing_id asc`;
    case "price-desc":
      return sql`${priceDescSortValue} desc, doc.listing_id desc`;
    case "rating":
    case "recommended":
      return sql`doc.rating desc, doc.listing_id desc`;
    case "newest":
      return sql`${yearDescSortValue} desc, doc.listing_id desc`;
  }
}

function cursorFor(item: ListingSearchDoc, sort: SearchSort = "recommended"): SearchCursor {
  switch (sort) {
    case "price-asc":
      return { value: item.priceFromMinor ?? NULL_PRICE_ASC, listingId: item.listingId };
    case "price-desc":
      return { value: item.priceFromMinor ?? NULL_PRICE_DESC, listingId: item.listingId };
    case "newest":
      return { value: item.yearBuilt ?? NULL_YEAR_DESC, listingId: item.listingId };
    case "rating":
    case "recommended":
      return { value: item.rating, listingId: item.listingId };
  }
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

function sortedStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string").sort()
    : [];
}

function normalizeSearchRow(row: SearchRow): ListingSearchDoc {
  return {
    ...row,
    gallery: row.gallery ?? [],
    amenities: row.amenities ?? [],
  };
}

const priceAscSortValue = sql`coalesce(doc.price_from_minor, ${NULL_PRICE_ASC})`;
const priceDescSortValue = sql`coalesce(doc.price_from_minor, ${NULL_PRICE_DESC})`;
const yearDescSortValue = sql`coalesce(doc.year_built, ${NULL_YEAR_DESC})`;
