import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from "./cursor";
import type {
  AvailabilityCalendar,
  AvailabilityCalendarInput,
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

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
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
  if (!input.cursor && input.page) return searchListingsByPage(db, input);

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
  const rows = await db.execute<{
    countries: string[];
    sailingAreas: string[];
    charterCompanies: string[];
    marinas: string[];
    boatTypes: string[];
    models: string[];
    crews: string[];
    mainsailTypes: string[];
    equipment: string[];
    years: number[];
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
      coalesce(jsonb_agg(distinct doc.country) filter (where doc.country is not null), '[]'::jsonb) as countries,
      coalesce(jsonb_agg(distinct doc.region) filter (where doc.region is not null), '[]'::jsonb) as "sailingAreas",
      coalesce(jsonb_agg(distinct doc.operator) filter (where doc.operator is not null), '[]'::jsonb) as "charterCompanies",
      coalesce(jsonb_agg(distinct doc.base_name) filter (where doc.base_name is not null), '[]'::jsonb) as marinas,
      coalesce(jsonb_agg(distinct doc.category) filter (where doc.category is not null), '[]'::jsonb) as "boatTypes",
      coalesce(jsonb_agg(distinct coalesce(doc.model, doc.builder)) filter (where coalesce(doc.model, doc.builder) is not null), '[]'::jsonb) as models,
      coalesce(jsonb_agg(distinct doc.crew_type) filter (where doc.crew_type is not null), '[]'::jsonb) as crews,
      coalesce(jsonb_agg(distinct doc.sail_type) filter (where doc.sail_type is not null), '[]'::jsonb) as "mainsailTypes",
      coalesce(jsonb_agg(distinct amenity.value) filter (where amenity.value is not null), '[]'::jsonb) as equipment,
      coalesce(jsonb_agg(distinct doc.year_built) filter (where doc.year_built is not null), '[]'::jsonb) as years,
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
    left join lateral jsonb_array_elements_text(doc.amenities) amenity(value) on true
    where ${whereClause(input)}
  `);
  const row = rows.rows[0];
  const countries = sortedStrings(row?.countries);
  const sailingAreas = sortedStrings(row?.sailingAreas);
  const charterCompanies = sortedStrings(row?.charterCompanies);
  const marinas = sortedStrings(row?.marinas);
  const boatTypes = sortedStrings(row?.boatTypes);
  const models = sortedStrings(row?.models);
  const crews = sortedStrings(row?.crews);
  const mainsailTypes = sortedStrings(row?.mainsailTypes);
  const equipment = sortedStrings(row?.equipment);
  const years = sortedNumbers(row?.years);
  const currency = row?.currency ?? input.currency ?? "EUR";
  const priceRange = {
    minMinor: row?.minMinor ?? 0,
    maxMinor: row?.maxMinor ?? 0,
    currency,
  };
  const yearRange = numberRange(row?.minYear, row?.maxYear);

  return {
    destinations: countries,
    categories: boatTypes,
    amenities: equipment,
    options: {
      countries: optionsFromStrings(countries),
      sailingAreas: optionsFromStrings(sailingAreas),
      charterCompanies: optionsFromStrings(charterCompanies),
      marinas: optionsFromStrings(marinas),
      durations: DEFAULT_DURATIONS,
      dateFlexibility: DEFAULT_DATE_FLEXIBILITY,
      boatTypes: optionsFromStrings(boatTypes),
      models: optionsFromStrings(models),
      crews: optionsFromStrings(crews),
      mainsailTypes: optionsFromStrings(mainsailTypes),
      equipment: optionsFromStrings(equipment),
      lengthUnits: DEFAULT_LENGTH_UNITS,
      years: [
        { value: "any", label: "Any year" },
        ...years.map((year) => ({ value: String(year), label: String(year) })),
      ],
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
  if (input.country?.length) parts.push(normalizedIn(sql`doc.country`, input.country));
  if (input.sailingArea?.length) parts.push(normalizedIn(sql`doc.region`, input.sailingArea));
  if (input.charterCompany?.length) {
    parts.push(normalizedIn(sql`doc.operator`, input.charterCompany));
  }
  if (input.marina?.length) {
    parts.push(
      sql`(${normalizedIn(sql`doc.base_name`, input.marina)} or ${normalizedIn(sql`doc.base_id`, input.marina)})`,
    );
  }
  if (input.boatType?.length) parts.push(normalizedIn(sql`doc.category`, input.boatType));
  if (input.model?.length) {
    parts.push(
      sql`(${normalizedIn(sql`doc.model`, input.model)} or ${normalizedIn(sql`doc.builder`, input.model)})`,
    );
  }
  if (input.crew?.length) parts.push(normalizedIn(sql`doc.crew_type`, input.crew));
  if (input.mainsailType?.length) {
    parts.push(normalizedIn(sql`doc.sail_type`, input.mainsailType));
  }
  if (input.equipment?.length) {
    for (const value of input.equipment) {
      parts.push(sql`exists (
        select 1
        from jsonb_array_elements_text(doc.amenities) amenity(value)
        where ${normalizedIn(sql`amenity.value`, [value])}
      )`);
    }
  }
  if (input.minCabins) parts.push(sql`doc.cabins >= ${input.minCabins}`);
  if (input.maxCabins !== undefined) parts.push(sql`doc.cabins <= ${input.maxCabins}`);
  if (input.guests) parts.push(sql`doc.berths >= ${input.guests}`);
  if (input.minBerths !== undefined) parts.push(sql`doc.berths >= ${input.minBerths}`);
  if (input.maxBerths !== undefined) parts.push(sql`doc.berths <= ${input.maxBerths}`);
  if (input.minBathrooms !== undefined) parts.push(sql`doc.heads >= ${input.minBathrooms}`);
  if (input.maxBathrooms !== undefined) parts.push(sql`doc.heads <= ${input.maxBathrooms}`);
  if (input.minLength !== undefined) parts.push(sql`doc.length_m >= ${input.minLength}`);
  if (input.maxLength !== undefined) parts.push(sql`doc.length_m <= ${input.maxLength}`);
  if (input.minGuestRating !== undefined) parts.push(sql`doc.rating >= ${input.minGuestRating}`);
  if (input.maxGuestRating !== undefined) parts.push(sql`doc.rating <= ${input.maxGuestRating}`);
  if (input.yearFrom !== undefined) parts.push(sql`doc.year_built >= ${input.yearFrom}`);
  if (input.yearTo !== undefined) parts.push(sql`doc.year_built <= ${input.yearTo}`);
  if (input.minBoatAge !== undefined) {
    parts.push(sql`doc.year_built <= ${CURRENT_YEAR - input.minBoatAge}`);
  }
  if (input.maxBoatAge !== undefined) {
    parts.push(sql`doc.year_built >= ${CURRENT_YEAR - input.maxBoatAge}`);
  }
  if (input.minPriceMinor) parts.push(sql`doc.price_from_minor >= ${input.minPriceMinor}`);
  if (input.maxPriceMinor) parts.push(sql`doc.price_from_minor <= ${input.maxPriceMinor}`);
  if (input.withoutAvailabilityConfirmation) {
    parts.push(sql`doc.has_unconfirmed_availability = true`);
  }
  if (input.underTemporaryBooking) parts.push(sql`doc.has_temporary_booking = true`);
  if (input.depositInsurance) parts.push(sql`doc.deposit_insurance_included = true`);
  if (input.petsAllowed) parts.push(sql`doc.pets_allowed = true`);
  if (input.currency) parts.push(sql`doc.currency = ${input.currency}`);
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

function optionsFromStrings(values: string[]): ListingFacetOption[] {
  return values.map((label) => ({ value: valueForLabel(label), label }));
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

function sortedNumbers(values: unknown): number[] {
  return Array.isArray(values)
    ? values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
    : [];
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
