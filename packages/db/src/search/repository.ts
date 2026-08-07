import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from "./cursor";
import type {
  AvailabilityCalendar,
  AvailabilityCalendarInput,
  FacetMediaKind,
  ListingDetail,
  ListingFacets,
  ListingFacetOption,
  ListingMapMarker,
  ListingPricedItem,
  ListingReview,
  ListingSearchDoc,
  ListingSearchInput,
  ListingSearchPagination,
  ListingSearchResult,
  ListingSuggestion,
  SearchSort,
} from "./types";

type SearchRow = ListingSearchDoc;
type FacetFilterKey = keyof ListingSearchInput;
type FacetOptionRow = {
  label: string;
  count: number;
  priceFromMinor: number | null;
  currency: string | null;
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 500;
const NULL_PRICE_ASC = 2_147_483_647;
const NULL_PRICE_DESC = -1;
const NULL_YEAR_DESC = 0;
const CURRENT_YEAR = new Date().getUTCFullYear();

const DEFAULT_DURATIONS: ListingFacetOption[] = [
  { value: "7", label: "7 days" },
  { value: "3", label: "3 days" },
  { value: "10", label: "10 days" },
  { value: "14", label: "14 days" },
];

const DEFAULT_DATE_FLEXIBILITY: ListingFacetOption[] = [
  { value: "on-day", label: "On day" },
  { value: "1-3-days", label: "In 1-3 days" },
  { value: "1-week", label: "In 1 week" },
  { value: "2-weeks", label: "In 2 weeks" },
  { value: "1-month", label: "In 1 month" },
];

const DEFAULT_LENGTH_UNITS: ListingFacetOption[] = [
  { value: "ft", label: "ft" },
  { value: "m", label: "m" },
];

export async function searchListings(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingSearchResult> {
  if (!input.cursor) return searchListingsByPage(db, input);

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

export async function getListingDetailByIdOrSlug(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
): Promise<ListingDetail | undefined> {
  const listing = await getListingByIdOrSlug(db, idOrSlug);
  if (!listing) return undefined;

  const [infoRows, amenityRows, faqRows, reviews, popularYachts] = await Promise.all([
    db.execute<{
      beamM: string | null;
      draftM: string | null;
      engines: number | null;
      enginePower: string | null;
      fuelCapacity: number | null;
      waterCapacity: number | null;
      checkInTime: string | null;
      checkOutTime: string | null;
    }>(sql`
      select
        spec.beam_m as "beamM",
        spec.draft_m as "draftM",
        spec.engines,
        spec.engine_power as "enginePower",
        spec.fuel_capacity as "fuelCapacity",
        spec.water_capacity as "waterCapacity",
        bs.check_in_time as "checkInTime",
        bs.check_out_time as "checkOutTime"
      from listing l
      left join listing_specification spec on spec.listing_id = l.id
      left join base bs on bs.id = l.home_base_id
      where l.id = ${listing.listingId}
      limit 1
    `),
    db.execute<{
      code: string | null;
      label: string;
      obligatory: boolean;
      priceMinor: number | null;
      priceCurrency: string | null;
    }>(sql`
      select
        a.code,
        a.name as label,
        la.obligatory,
        la.price_minor as "priceMinor",
        la.price_currency as "priceCurrency"
      from listing_amenity la
      join amenity a on a.id = la.amenity_id
      where la.listing_id = ${listing.listingId}
      order by la.obligatory desc, la.price_minor nulls first, a.name asc
    `),
    db.execute<{ id: string; question: string; answer: string }>(sql`
      select id, question, answer
      from faq
      where listing_id = ${listing.listingId}
      order by sort_order asc, created_at asc
    `),
    listListingReviews(db, listing.listingId),
    listSimilarListings(db, listing.listingId),
  ]);
  const info = infoRows.rows[0];
  const amenities = amenityRows.rows.map((item) => ({
    ...item,
    code: item.code ?? valueForLabel(item.label),
  }));
  const includedAmenities = amenities
    .filter((item) => !item.obligatory && item.priceMinor === null)
    .map((item) => ({ code: item.code, label: item.label }));
  const mandatoryExtras = amenities
    .filter((item) => item.obligatory && item.priceMinor !== null)
    .map((item) => pricedItem(item, listing.currency));
  const optionalExtras = amenities
    .filter((item) => !item.obligatory && item.priceMinor !== null)
    .map((item) => pricedItem(item, listing.currency));

  return {
    ...listing,
    description: descriptionFor(listing),
    overview: overviewFor(listing, info),
    includedAmenities,
    mandatoryExtras,
    optionalExtras,
    importantInformation: {
      charterCompany: listing.operator,
      yachtPickupAddress: `${listing.baseName}, ${listing.location}, ${listing.country}`,
      yachtPickup: {
        date: listing.availableFrom,
        time: info?.checkInTime ?? null,
      },
      yachtDropOff: {
        date: listing.availableTo,
        time: info?.checkOutTime ?? null,
      },
      cancellationPaymentPolicies:
        "Cancellation and prepayment policies vary according to your selection. Payment conditions are confirmed during quote and booking.",
      sailingLicenseRequired:
        listing.crewType === "bareboat"
          ? "Valid sailing license or local equivalent required."
          : "No license is needed when booking with crew or skipper.",
      pets: listing.petsAllowed
        ? "Pets are allowed on this yacht with charter company confirmation."
        : "Pets are not permitted on this yacht.",
      paymentMethodsAcceptedByCharterCompany: ["card", "bank_transfer", "cash"],
      marinaInformation: `${listing.baseName} is located in ${listing.location}, ${listing.country}. Check-in and check-out times are provided by the charter base.`,
      marinaContact: {
        name: listing.baseName,
        address: `${listing.baseName}, ${listing.location}, ${listing.country}`,
        email: listing.baseEmail,
        phone: listing.basePhone,
        website: listing.baseWebsite,
      },
      map: { lat: listing.lat ?? 0, lng: listing.lng ?? 0 },
    },
    suggestedRoute: suggestedRouteFor(listing),
    reviews,
    faq: faqRows.rows,
    popularYachts,
  };
}

export async function listSearchFacets(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput = {},
): Promise<ListingFacets> {
  const [
    countries,
    sailingAreas,
    charterCompanies,
    marinas,
    boatTypes,
    models,
    crews,
    mainsailTypes,
    equipment,
    years,
    rangeRows,
  ] = await Promise.all([
    listFacetOptions(db, input, sql`doc.country`, ["country", "destination"], "country"),
    listFacetOptions(db, input, sql`doc.region`, ["sailingArea", "destination"], "region"),
    listFacetOptions(db, input, sql`doc.operator`, ["charterCompany"]),
    listFacetOptions(db, input, sql`doc.base_name`, ["marina", "destination"], "marina"),
    listFacetOptions(db, input, sql`doc.category`, ["boatType", "category"], "category"),
    listFacetOptions(db, input, sql`coalesce(doc.model, doc.builder)`, ["model", "query"]),
    listFacetOptions(db, input, sql`doc.crew_type`, ["crew"], "crew"),
    listFacetOptions(db, input, sql`doc.sail_type`, ["mainsailType"], "sail_type"),
    listEquipmentFacetOptions(db, input),
    listFacetOptions(db, input, sql`doc.year_built::text`, ["yearFrom", "yearTo"]),
    db.execute<{
      minLength: string | null;
      maxLength: string | null;
      minCabins: number | null;
      maxCabins: number | null;
      minBerths: number | null;
      maxBerths: number | null;
      minBathrooms: number | null;
      maxBathrooms: number | null;
      minMinor: number | null;
      maxMinor: number | null;
      minYear: number | null;
      maxYear: number | null;
      minRating: string | null;
      maxRating: string | null;
      hasUnconfirmedAvailability: boolean | null;
      hasTemporaryBooking: boolean | null;
      hasDepositInsurance: boolean | null;
      hasPetsAllowed: boolean | null;
      currency: string | null;
    }>(sql`
      select
        min(doc.length_m) as "minLength",
        max(doc.length_m) as "maxLength",
        min(doc.cabins) as "minCabins",
        max(doc.cabins) as "maxCabins",
        min(doc.berths) as "minBerths",
        max(doc.berths) as "maxBerths",
        min(doc.heads) as "minBathrooms",
        max(doc.heads) as "maxBathrooms",
        min(doc.price_from_minor) as "minMinor",
        max(doc.price_from_minor) as "maxMinor",
        min(doc.year_built) as "minYear",
        max(doc.year_built) as "maxYear",
        min(doc.rating) as "minRating",
        max(doc.rating) as "maxRating",
        bool_or(doc.has_unconfirmed_availability) as "hasUnconfirmedAvailability",
        bool_or(doc.has_temporary_booking) as "hasTemporaryBooking",
        bool_or(doc.deposit_insurance_included) as "hasDepositInsurance",
        bool_or(doc.pets_allowed) as "hasPetsAllowed",
        coalesce(min(doc.currency), ${input.currency ?? "EUR"}) as currency
      from listing_search_doc doc
      where ${whereClause(input)}
    `),
  ]);
  const row = rangeRows.rows[0];
  const currency = row?.currency ?? input.currency ?? "EUR";
  const priceRange = {
    minMinor: row?.minMinor ?? 0,
    maxMinor: row?.maxMinor ?? 0,
    currency,
  };
  const yearRange = numberRange(row?.minYear, row?.maxYear);

  return {
    destinations: labelsFromOptions(countries),
    categories: labelsFromOptions(boatTypes),
    amenities: labelsFromOptions(equipment),
    options: {
      countries,
      sailingAreas,
      charterCompanies,
      marinas,
      durations: DEFAULT_DURATIONS,
      dateFlexibility: DEFAULT_DATE_FLEXIBILITY,
      boatTypes,
      models,
      crews,
      mainsailTypes,
      equipment,
      lengthUnits: DEFAULT_LENGTH_UNITS,
      years: [{ value: "any", label: "Any year" }, ...years],
    },
    ranges: {
      length: numberRange(row?.minLength, row?.maxLength),
      cabins: numberRange(row?.minCabins, row?.maxCabins),
      berths: numberRange(row?.minBerths, row?.maxBerths),
      bathrooms: numberRange(row?.minBathrooms, row?.maxBathrooms),
      price: priceRange,
      boatAge: boatAgeRange(yearRange),
      year: yearRange,
      guestRating: numberRange(row?.minRating, row?.maxRating),
    },
    toggles: {
      withoutAvailabilityConfirmation: row?.hasUnconfirmedAvailability ?? false,
      underTemporaryBooking: row?.hasTemporaryBooking ?? false,
      depositInsurance: row?.hasDepositInsurance ?? false,
      petsAllowed: row?.hasPetsAllowed ?? false,
    },
    priceRange,
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

export async function listListingReviews(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
): Promise<ListingReview[]> {
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
  doc.crew_type as "crewType",
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
  doc.base_email as "baseEmail",
  doc.base_phone as "basePhone",
  doc.base_website as "baseWebsite",
  doc.length_m as "lengthM",
  doc.cabins,
  doc.berths,
  doc.heads,
  doc.year_built as "yearBuilt",
  doc.sail_type as "sailType",
  doc.deposit_insurance_included as "depositInsuranceIncluded",
  doc.pets_allowed as "petsAllowed",
  doc.rating,
  doc.review_count as "reviewCount",
  doc.main_image as "mainImage",
  doc.gallery,
  doc.amenities,
  doc.price_from_minor as "priceFromMinor",
  doc.currency,
  doc.available_from as "availableFrom",
  doc.available_to as "availableTo",
  doc.has_unconfirmed_availability as "hasUnconfirmedAvailability",
  doc.has_temporary_booking as "hasTemporaryBooking"
`;

function whereClause(input: ListingSearchInput, ignored: readonly FacetFilterKey[] = []): SQL {
  const skip = new Set<FacetFilterKey>(ignored);
  const parts: SQL[] = [sql`true`];
  if (!skip.has("destination") && input.destination) {
    const pattern = `%${input.destination}%`;
    parts.push(sql`(
      doc.country ilike ${pattern}
      or doc.region ilike ${pattern}
      or doc.location ilike ${pattern}
      or doc.base_name ilike ${pattern}
    )`);
  }
  if (!skip.has("query") && input.query) {
    parts.push(sql`doc.searchable_text ilike ${`%${input.query}%`}`);
  }
  if (!skip.has("category") && input.category) parts.push(sql`doc.category = ${input.category}`);
  if (!skip.has("country") && input.country?.length) {
    parts.push(normalizedIn(sql`doc.country`, input.country));
  }
  if (!skip.has("sailingArea") && input.sailingArea?.length) {
    parts.push(normalizedIn(sql`doc.region`, input.sailingArea));
  }
  if (!skip.has("charterCompany") && input.charterCompany?.length) {
    parts.push(normalizedIn(sql`doc.operator`, input.charterCompany));
  }
  if (!skip.has("marina") && input.marina?.length) {
    parts.push(
      sql`(${normalizedIn(sql`doc.base_name`, input.marina)} or ${normalizedIn(sql`doc.base_id`, input.marina)})`,
    );
  }
  if (!skip.has("boatType") && input.boatType?.length) {
    parts.push(normalizedIn(sql`doc.category`, input.boatType));
  }
  if (!skip.has("model") && input.model?.length) {
    parts.push(
      sql`(${normalizedIn(sql`doc.model`, input.model)} or ${normalizedIn(sql`doc.builder`, input.model)})`,
    );
  }
  if (!skip.has("crew") && input.crew?.length) {
    parts.push(normalizedIn(sql`doc.crew_type`, input.crew));
  }
  if (!skip.has("mainsailType") && input.mainsailType?.length) {
    parts.push(normalizedIn(sql`doc.sail_type`, input.mainsailType));
  }
  if (!skip.has("equipment") && input.equipment?.length) {
    for (const value of input.equipment) {
      parts.push(sql`exists (
        select 1
        from jsonb_array_elements_text(doc.amenities) amenity(value)
        where ${normalizedIn(sql`amenity.value`, [value])}
      )`);
    }
  }
  if (!skip.has("minCabins") && input.minCabins) {
    parts.push(sql`doc.cabins >= ${input.minCabins}`);
  }
  if (!skip.has("maxCabins") && input.maxCabins !== undefined) {
    parts.push(sql`doc.cabins <= ${input.maxCabins}`);
  }
  if (!skip.has("guests") && input.guests) parts.push(sql`doc.berths >= ${input.guests}`);
  if (!skip.has("minBerths") && input.minBerths !== undefined) {
    parts.push(sql`doc.berths >= ${input.minBerths}`);
  }
  if (!skip.has("maxBerths") && input.maxBerths !== undefined) {
    parts.push(sql`doc.berths <= ${input.maxBerths}`);
  }
  if (!skip.has("minBathrooms") && input.minBathrooms !== undefined) {
    parts.push(sql`doc.heads >= ${input.minBathrooms}`);
  }
  if (!skip.has("maxBathrooms") && input.maxBathrooms !== undefined) {
    parts.push(sql`doc.heads <= ${input.maxBathrooms}`);
  }
  if (!skip.has("minLength") && input.minLength !== undefined) {
    parts.push(sql`doc.length_m >= ${input.minLength}`);
  }
  if (!skip.has("maxLength") && input.maxLength !== undefined) {
    parts.push(sql`doc.length_m <= ${input.maxLength}`);
  }
  if (!skip.has("minGuestRating") && input.minGuestRating !== undefined) {
    parts.push(sql`doc.rating >= ${input.minGuestRating}`);
  }
  if (!skip.has("maxGuestRating") && input.maxGuestRating !== undefined) {
    parts.push(sql`doc.rating <= ${input.maxGuestRating}`);
  }
  if (!skip.has("yearFrom") && input.yearFrom !== undefined) {
    parts.push(sql`doc.year_built >= ${input.yearFrom}`);
  }
  if (!skip.has("yearTo") && input.yearTo !== undefined) {
    parts.push(sql`doc.year_built <= ${input.yearTo}`);
  }
  if (!skip.has("minBoatAge") && input.minBoatAge !== undefined) {
    parts.push(sql`doc.year_built <= ${CURRENT_YEAR - input.minBoatAge}`);
  }
  if (!skip.has("maxBoatAge") && input.maxBoatAge !== undefined) {
    parts.push(sql`doc.year_built >= ${CURRENT_YEAR - input.maxBoatAge}`);
  }
  if (!skip.has("minPriceMinor") && input.minPriceMinor) {
    parts.push(sql`doc.price_from_minor >= ${input.minPriceMinor}`);
  }
  if (!skip.has("maxPriceMinor") && input.maxPriceMinor) {
    parts.push(sql`doc.price_from_minor <= ${input.maxPriceMinor}`);
  }
  if (!skip.has("withoutAvailabilityConfirmation") && input.withoutAvailabilityConfirmation) {
    parts.push(sql`doc.has_unconfirmed_availability = true`);
  }
  if (!skip.has("underTemporaryBooking") && input.underTemporaryBooking) {
    parts.push(sql`doc.has_temporary_booking = true`);
  }
  if (!skip.has("depositInsurance") && input.depositInsurance) {
    parts.push(sql`doc.deposit_insurance_included = true`);
  }
  if (!skip.has("petsAllowed") && input.petsAllowed) parts.push(sql`doc.pets_allowed = true`);
  const availabilityWindow = availabilityWindowFor(input);
  if (availabilityWindow) {
    parts.push(sql`exists (
      select 1
      from availability_slot slot
      where slot.listing_id = doc.listing_id
        and slot.status = 'available'
        and slot.start_date <= ${availabilityWindow.checkIn}
        and slot.end_date >= ${availabilityWindow.checkOut}
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

async function listFacetOptions(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
  expression: SQL,
  ignored: readonly FacetFilterKey[],
  kind?: FacetMediaKind,
): Promise<ListingFacetOption[]> {
  const rows = await db.execute<FacetOptionRow>(sql`
    select
      ${expression} as label,
      count(*)::integer as count,
      min(doc.price_from_minor) as "priceFromMinor",
      min(doc.currency) as currency
    from listing_search_doc doc
    where ${whereClause(input, ignored)}
      and ${expression} is not null
    group by label
    order by label asc
  `);

  return decorateFacetOptions(db, rows.rows, kind);
}

async function listEquipmentFacetOptions(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
): Promise<ListingFacetOption[]> {
  const rows = await db.execute<FacetOptionRow>(sql`
    select
      amenity.value as label,
      count(distinct doc.listing_id)::integer as count,
      min(doc.price_from_minor) as "priceFromMinor",
      min(doc.currency) as currency
    from listing_search_doc doc
    cross join lateral jsonb_array_elements_text(doc.amenities) amenity(value)
    where ${whereClause(input, ["equipment"])}
      and amenity.value is not null
    group by amenity.value
    order by amenity.value asc
  `);

  return decorateFacetOptions(db, rows.rows, "equipment");
}

/*
 * Attaches facet_media copy to grouped facet rows.
 *
 * One extra query per decorated group rather than a join per facet query: the media
 * table is small, and joining inside the grouped query would force the normalization
 * expression into the group key.
 */
async function decorateFacetOptions(
  db: NodePgDatabase<typeof schema>,
  rows: FacetOptionRow[],
  kind?: FacetMediaKind,
): Promise<ListingFacetOption[]> {
  const options = rows.map((row) => ({
    value: valueForLabel(row.label),
    label: row.label,
    count: row.count,
    priceFromMinor: row.priceFromMinor,
    currency: row.currency,
  }));

  if (!kind || options.length === 0) return options;

  const media = await db.execute<{
    key: string;
    imageUrl: string | null;
    cloudinaryId: string | null;
    description: string | null;
  }>(sql`
    select
      ${normalizedSql(sql`media.value`)} as key,
      media.image_url as "imageUrl",
      media.cloudinary_id as "cloudinaryId",
      media.description
    from facet_media media
    where media.kind = ${kind}
  `);
  const byKey = new Map(media.rows.map((row) => [row.key, row]));

  return options.map((option) => {
    const match = byKey.get(normalizedFilterValue(option.label));
    return {
      ...option,
      imageUrl: match?.imageUrl ?? null,
      cloudinaryId: match?.cloudinaryId ?? null,
      description: match?.description ?? null,
    };
  });
}

function labelsFromOptions(options: ListingFacetOption[]): string[] {
  return options.map((option) => option.label);
}

function pricedItem(
  item: {
    code: string;
    label: string;
    priceMinor: number | null;
    priceCurrency: string | null;
  },
  fallbackCurrency: string | null,
): ListingPricedItem {
  return {
    code: item.code,
    label: item.label,
    price: {
      amountMinor: item.priceMinor ?? 0,
      currency: item.priceCurrency ?? fallbackCurrency ?? "EUR",
    },
    pricingType: "pay_at_check_in",
  };
}

function descriptionFor(listing: ListingSearchDoc): string {
  const year = listing.yearBuilt ? `Built in ${listing.yearBuilt}` : "This yacht";
  const capacity = listing.berths
    ? `accommodates up to ${listing.berths} guests`
    : "is ready for a comfortable charter";
  const layout = [
    listing.cabins ? `${listing.cabins} cabins` : undefined,
    listing.heads ? `${listing.heads} bathrooms` : undefined,
  ]
    .filter(Boolean)
    .join(" and ");

  return `${year}, ${listing.title} ${capacity}${layout ? ` with ${layout}` : ""}. Based at ${listing.baseName} in ${listing.location}, this ${listing.category ?? "yacht"} is set up for a smooth charter with ${listing.operator}.`;
}

function overviewFor(
  listing: ListingSearchDoc,
  info:
    | {
        beamM: string | null;
        draftM: string | null;
        engines: number | null;
        enginePower: string | null;
        fuelCapacity: number | null;
        waterCapacity: number | null;
      }
    | undefined,
): { code: string; label: string; value: string }[] {
  return [
    { code: "location", label: "Location", value: `${listing.location}, ${listing.country}` },
    { code: "year", label: "Year", value: String(listing.yearBuilt ?? "Unknown") },
    { code: "boat-type", label: "Boat type", value: listing.category ?? "Yacht" },
    { code: "cabins", label: "Cabins", value: String(listing.cabins ?? 0) },
    { code: "bathrooms", label: "Bathrooms", value: String(listing.heads ?? 0) },
    { code: "length", label: "Length", value: metresValue(listing.lengthM) },
    { code: "mainsail", label: "Type of mainsail", value: listing.sailType ?? "Not specified" },
    { code: "draught", label: "Draught", value: metresValue(info?.draftM) },
    { code: "beam", label: "Beam", value: metresValue(info?.beamM) },
    {
      code: "fuel-tank",
      label: "Fuel tank",
      value: info?.fuelCapacity ? `${info.fuelCapacity} l` : "Not specified",
    },
    {
      code: "water-tank",
      label: "Water tank",
      value: info?.waterCapacity ? `${info.waterCapacity} l` : "Not specified",
    },
    {
      code: "engine",
      label: "Engine",
      value: [info?.engines, info?.enginePower].filter(Boolean).join(" x ") || "Not specified",
    },
  ];
}

function metresValue(value: string | null | undefined): string {
  return value ? `${Number(value).toFixed(2)} m` : "Not specified";
}

function suggestedRouteFor(listing: ListingSearchDoc): ListingDetail["suggestedRoute"] {
  const lat = listing.lat ?? 0;
  const lng = listing.lng ?? 0;
  const places = routePlacesFor(listing.region, listing.location);

  return {
    title: `7-day itinerary through ${listing.region}`,
    map: { lat, lng },
    stops: places.map((place, index) => ({
      day: index + 1,
      title: `Day ${index + 1} - ${place.title}`,
      description: place.description,
      lat: lat + place.latOffset,
      lng: lng + place.lngOffset,
    })),
  };
}

function routePlacesFor(region: string, location: string) {
  if (region.toLowerCase().includes("dalmatia")) {
    return [
      {
        title: location,
        description: "Check-in and evening in the marina.",
        latOffset: 0,
        lngOffset: 0,
      },
      {
        title: "Hvar",
        description: "Sail to a lively island stop with protected bays.",
        latOffset: -0.18,
        lngOffset: 0.15,
      },
      {
        title: "Vis",
        description: "Continue to clear water and quiet anchorages.",
        latOffset: -0.38,
        lngOffset: 0.04,
      },
      {
        title: "Blue Cave",
        description: "Visit one of the Adriatic's best-known natural sights.",
        latOffset: -0.47,
        lngOffset: -0.1,
      },
      {
        title: "Korcula",
        description: "Explore old-town streets and a sheltered overnight stop.",
        latOffset: -0.56,
        lngOffset: 0.42,
      },
      {
        title: "Brac",
        description: "Return through island beaches and swim stops.",
        latOffset: -0.26,
        lngOffset: 0.32,
      },
      { title: location, description: "Final morning return to base.", latOffset: 0, lngOffset: 0 },
    ];
  }

  return [
    {
      title: location,
      description: "Check-in and provisioning at the charter base.",
      latOffset: 0,
      lngOffset: 0,
    },
    {
      title: `${region} coast`,
      description: "Short sail to a protected anchorage.",
      latOffset: 0.12,
      lngOffset: 0.16,
    },
    {
      title: "Island bay",
      description: "Swimming stop and relaxed overnight.",
      latOffset: 0.18,
      lngOffset: -0.12,
    },
    {
      title: "Old town",
      description: "Harbor visit with restaurants ashore.",
      latOffset: -0.12,
      lngOffset: 0.18,
    },
    {
      title: "Quiet cove",
      description: "Sheltered bay for paddleboarding and snorkeling.",
      latOffset: -0.18,
      lngOffset: -0.08,
    },
    {
      title: "Marina approach",
      description: "Easy sail back toward the base area.",
      latOffset: 0.08,
      lngOffset: -0.2,
    },
    { title: location, description: "Check-out at the home marina.", latOffset: 0, lngOffset: 0 },
  ];
}

function valueForLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedIn(column: SQL, values: string[]): SQL {
  const normalizedValues = values.map(normalizedFilterValue).filter(Boolean);
  if (normalizedValues.length === 0) return sql`false`;

  return sql`${normalizedSql(column)} in (${sql.join(
    normalizedValues.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}

function normalizedSql(value: SQL): SQL {
  return sql`regexp_replace(lower(coalesce(${value}, '')), '[^a-z0-9]+', '', 'g')`;
}

function normalizedFilterValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function availabilityWindowFor(
  input: ListingSearchInput,
): { checkIn: string; checkOut: string } | undefined {
  if (input.checkIn && input.checkOut) {
    return { checkIn: input.checkIn, checkOut: input.checkOut };
  }

  if (!input.startDate || !input.duration) return undefined;

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return undefined;

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + input.duration);

  return {
    checkIn: start.toISOString().slice(0, 10),
    checkOut: end.toISOString().slice(0, 10),
  };
}

function numberRange(min: unknown, max: unknown): { min: number; max: number } {
  const normalizedMin = numberOrZero(min);
  const normalizedMax = numberOrZero(max);

  return {
    min: Math.min(normalizedMin, normalizedMax),
    max: Math.max(normalizedMin, normalizedMax),
  };
}

function numberOrZero(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boatAgeRange(yearRange: { min: number; max: number }): { min: number; max: number } {
  if (yearRange.min === 0 && yearRange.max === 0) return { min: 0, max: 0 };

  return {
    min: Math.max(CURRENT_YEAR - yearRange.max, 0),
    max: Math.max(CURRENT_YEAR - yearRange.min, 0),
  };
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
