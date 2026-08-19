import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { crewOptionsFor } from "./crew";
import {
  decodeSearchCursor,
  encodeSearchCursor,
  type DecodedSearchCursor,
  type SearchCursor,
} from "./cursor";
import { DEFAULT_LOCALE, localizeSearchDocs } from "./localize";
import type {
  AvailabilityCalendar,
  AvailabilityCalendarInput,
  AvailabilityConstraints,
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

  const items = await localizeSearchDocs(
    db,
    rows.rows.slice(0, limit).map(normalizeSearchRow),
    input.locale,
  );
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
  const items = await localizeSearchDocs(db, rows.rows.map(normalizeSearchRow), input.locale);

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

/**
 * The provider's own description in `locale`, or undefined when it ships none.
 *
 * `listing_search_doc` bakes provider prose into `searchable_text` only, so the detail read is
 * the one place it can still be recovered per locale. English is not a fallback here on purpose:
 * serving it under `lang="uk"` is the duplicate-content case the caller's generated copy avoids.
 */
async function providerDescription(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  locale: string,
): Promise<string | undefined> {
  const rows = await db.execute<{ value: string }>(sql`
    select value
    from listing_text
    where listing_id = ${listingId} and kind = 'description' and locale = ${locale}
    limit 1
  `);

  return rows.rows[0]?.value;
}

export async function getListingDetailByIdOrSlug(
  db: NodePgDatabase<typeof schema>,
  idOrSlug: string,
  locale: string = DEFAULT_LOCALE,
): Promise<ListingDetail | undefined> {
  const raw = await getListingByIdOrSlug(db, idOrSlug);
  if (!raw) return undefined;

  const [localized] = await localizeSearchDocs(db, [raw], locale);
  const listing = localized ?? raw;

  const [infoRows, amenityRows, extraRows, faqRows, reviews, popularYachts, prose] =
    await Promise.all([
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
        crew: boolean;
        priceMinor: number | null;
        priceCurrency: string | null;
      }>(sql`
      select
        a.code,
        a.name as label,
        a.crew,
        la.obligatory,
        la.price_minor as "priceMinor",
        la.price_currency as "priceCurrency"
      from listing_amenity la
      join amenity a on a.id = la.amenity_id
      where la.listing_id = ${listing.listingId}
      order by la.obligatory desc, la.price_minor nulls first, a.name asc
    `),
      db.execute<{
        source: string;
        kind: string;
        externalId: string;
        label: string;
        obligatory: boolean;
        crewRole: string | null;
        priceMinor: number | null;
        priceCurrency: string | null;
      }>(sql`
      select
        source,
        kind,
        external_id as "externalId",
        name as label,
        obligatory,
        crew_role as "crewRole",
        price_minor as "priceMinor",
        price_currency as "priceCurrency"
      from provider_extra_catalogue
      where listing_id = ${listing.listingId}
      order by obligatory desc, price_minor, name asc
    `),
      db.execute<{ id: string; question: string; answer: string }>(sql`
      select id, question, answer
      from faq
      where listing_id = ${listing.listingId}
      order by sort_order asc, created_at asc
    `),
      listListingReviews(db, listing.listingId),
      listSimilarListings(db, listing.listingId),
      providerDescription(db, listing.listingId, locale),
    ]);
  const info = infoRows.rows[0];
  const amenities = amenityRows.rows.map((item) => ({
    ...item,
    code: item.code ?? valueForLabel(item.label),
  }));
  const includedAmenities = amenities
    .filter((item) => !item.crew && item.priceMinor === null)
    .map((item) => ({ code: item.code, label: item.label }));
  /*
   * Extras come from provider_extra_catalogue, not from listing_amenity. The two
   * answer different questions — what the yacht has versus what it costs extra —
   * and providers key them in separate id spaces. Reading both from one set of
   * columns is what left these sections empty for every synced listing: the
   * catalogue sync only ever knew the yacht's standard equipment.
   *
   * The code is the provider id space plus its id, which is stable across syncs
   * and cannot collide a service with an equipment of the same number.
   */
  const extras = extraRows.rows.map((item) => ({
    code: `${item.kind}:${item.externalId}`,
    label: item.label,
    obligatory: item.obligatory,
    crewRole: item.crewRole,
    priceMinor: item.priceMinor,
    priceCurrency: item.priceCurrency,
    selectable: isSelectableExtra(item.source, item.kind),
  }));
  const mandatoryExtras = extras
    .filter((item) => item.obligatory)
    .map((item) => pricedItem(item, listing.currency));
  // Crew is deliberately not in optionalExtras: the sidebar buys it through the
  // Crew control, and listing it twice would let the customer add a skipper the
  // crew type does not include.
  const optionalExtras = extras
    .filter((item) => !item.obligatory && item.crewRole === null)
    .map((item) => ({
      ...pricedItem(item, listing.currency),
      selectable: item.selectable,
    }));
  /*
   * Two sources because the two kinds of listing carry crew differently. A seeded
   * listing flags the amenity itself; a synced one has no such flag from the vendor,
   * so the role was read off the service name at projection time and lives on the
   * extras catalogue instead.
   *
   * Either way the code is the bare role, not the provider's id, because
   * `crewOptionsFor` decides what the Crew control may offer by looking for
   * `skipper`/`hostess`/`cook`.
   */
  const crewRoles = [
    ...amenities
      .filter((item) => item.crew && item.priceMinor !== null)
      .map((item) => pricedItem(item, listing.currency)),
    ...extras
      .filter((item) => item.crewRole !== null)
      .map((item) => pricedItem({ ...item, code: item.crewRole ?? item.code }, listing.currency)),
  ];

  return {
    ...listing,
    /*
     * Null rather than the generated sentence when the provider ships no prose for this locale.
     * The generated copy is translated, and its translations live in the web app's message files,
     * so building it here would mean shipping Ukrainian string templates from the database package.
     */
    description: prose ?? null,
    overview: overviewFor(listing, info),
    includedAmenities,
    mandatoryExtras,
    optionalExtras,
    crew: {
      options: crewOptionsFor(
        listing.crewType,
        crewRoles.map((role) => role.code),
      ),
      roles: crewRoles,
    },
    importantInformation: {
      charterCompany: listing.operator,
      yachtPickupAddress: `${listing.baseName}, ${listing.location}, ${listing.country}`,
      /*
       * Times only. These carried `available_from`/`available_to`, which are the first and last
       * dates the boat is free anywhere in the horizon — not this charter's pickup and drop-off.
       * A listing page has no charter yet, so it has no date to state; the base's times hold
       * whatever dates the visitor later picks.
       */
      yachtPickup: { time: info?.checkInTime ?? null },
      yachtDropOff: { time: info?.checkOutTime ?? null },
      cancellationPaymentPolicies:
        "Cancellation and prepayment policies vary according to your selection. Payment conditions are confirmed during quote and booking.",
      sailingLicenseRequired:
        listing.crewType === "bareboat"
          ? "Valid sailing license or local equivalent required."
          : "No license is needed when booking with crew or skipper.",
      /*
       * Absence of the flag is not a prohibition. NauSYS publishes no pets field at all, so
       * `pets_allowed` is false for the whole fleet, and the old copy turned "we were not told"
       * into "not permitted" on 109 listings. Ask the base instead of inventing its policy.
       */
      pets: listing.petsAllowed
        ? "Pets are allowed on this yacht with charter company confirmation."
        : "Pet policy is set by the charter base — ask before booking.",
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
  // Empty field: seed the typeahead with the most-stocked countries so the user has somewhere to
  // start, instead of an alphabetical slice that means nothing. Data-driven, so it never lists a
  // country with no listings.
  if (query.trim() === "") {
    const popular = await db.execute<Omit<ListingSuggestion, "value">>(sql`
      select doc.country as label, 'country' as kind
      from listing_search_doc doc
      where doc.country is not null
      group by doc.country
      order by count(*) desc, doc.country asc
      limit 5
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
    availabilityConfirmed: boolean;
  }>(sql`
    select
      slot.start_date as "startDate",
      slot.end_date as "endDate",
      slot.status,
      slot.price_minor as "priceMinor",
      slot.currency,
      slot.min_nights as "minNights",
      slot.checkin_weekday as "checkinWeekday",
      slot.checkout_weekday as "checkoutWeekday",
      slot.availability_confirmed as "availabilityConfirmed"
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
      availabilityConfirmed: slot.availabilityConfirmed,
    })),
  };
}

export async function listAvailabilityConstraints(
  db: NodePgDatabase<typeof schema>,
  input: AvailabilityCalendarInput,
): Promise<AvailabilityConstraints> {
  /*
   * Overlap, not containment, unlike the calendar above. A booking that starts before
   * the window and ends inside it still blocks candidate ranges at this end, and a
   * containment filter would drop it and let the caller offer a period that is taken.
   */
  const overlapsWindow = sql`slot.start_date < ${input.to} and slot.end_date > ${input.from}`;

  const [rules, occupied, priced, oneWay] = await Promise.all([
    db.execute<{
      checkinWeekday: number | null;
      checkoutWeekday: number | null;
      minNights: number | null;
      maxNights: number | null;
    }>(sql`
      select
        rule.checkin_weekday as "checkinWeekday",
        rule.checkout_weekday as "checkoutWeekday",
        rule.min_nights as "minNights",
        rule.max_nights as "maxNights"
      from listing_checkin_rule rule
      where rule.listing_id = ${input.listingId}
      order by rule.min_nights asc nulls first, rule.checkin_weekday asc nulls first
    `),
    db.execute<{
      startDate: string;
      endDate: string;
      status: "option" | "occupied" | "blocked";
    }>(sql`
      select slot.start_date as "startDate", slot.end_date as "endDate", slot.status
      from availability_slot slot
      where slot.listing_id = ${input.listingId}
        and slot.status <> 'available'
        and ${overlapsWindow}
      order by slot.start_date asc
    `),
    db.execute<{
      startDate: string;
      endDate: string;
      priceMinor: number;
      currency: string;
      confirmed: boolean;
    }>(sql`
      /*
       * The provider's published rates, which is what makes a date sellable at all: it does
       * not publish one for a season it has not opened. Read from the rate list rather than
       * from priced slots, so the signal covers the season the provider actually priced
       * instead of only the periods someone enumerated inside it.
       */
      select
        price.start_date as "startDate",
        price.end_date as "endDate",
        price.price_minor as "priceMinor",
        price.currency,
        exists (
          select 1
          from availability_slot slot
          where slot.listing_id = price.listing_id
            and slot.status = 'available'
            and slot.availability_confirmed
            and slot.start_date >= price.start_date
            and slot.end_date <= price.end_date
        ) as "confirmed"
      from listing_price_period price
      where price.listing_id = ${input.listingId}
        and price.kind = 'weekly'
        and price.currency = ${input.currency ?? "EUR"}
        and price.start_date < ${input.to}
        and price.end_date > ${input.from}
      order by price.start_date asc
    `),
    db.execute<{
      startDate: string | null;
      endDate: string | null;
      isOneWay: boolean;
    }>(sql`
      select rule.start_date as "startDate", rule.end_date as "endDate", rule.is_one_way as "isOneWay"
      from listing_one_way_rule rule
      where rule.listing_id = ${input.listingId}
        and (rule.start_date is null or rule.start_date < ${input.to})
        and (rule.end_date is null or rule.end_date > ${input.from})
      order by rule.start_date asc nulls first
    `),
  ]);

  return {
    listingId: input.listingId,
    window: { from: input.from, to: input.to },
    rules: rules.rows,
    occupied: occupied.rows,
    priced: priced.rows,
    oneWay: oneWay.rows,
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

/*
 * The two numbers the card and the sidebar show under "booked / viewed". Both are
 * counted here rather than stored on `listing_search_doc`, because the doc is only
 * rebuilt on sync or publish and these change by the hour — a stored copy would be
 * a stale number presented as today's.
 *
 * Booked counts bookings that are still standing and were confirmed this month:
 * one taken and then cancelled or refunded is not a charter the visitor is
 * competing with, so only `CONFIRMED` counts. Both windows are UTC, matching how
 * `recordListingView` stamps a view, so neither count shifts with the server's
 * local timezone.
 */
const engagementColumns = sql`
  (
    select count(*)::integer
    from booking b
    where b.listing_id = doc.listing_id
      and b.status = 'CONFIRMED'
      and b.confirmed_at >= date_trunc('month', now() at time zone 'utc')
  ) as "bookedThisMonth",
  (
    select count(*)::integer
    from listing_view v
    where v.listing_id = doc.listing_id
      and v.viewed_on = (now() at time zone 'utc')::date
  ) as "viewedToday"
`;

const searchColumns = sql`
  doc.listing_id as "listingId",
  doc.slug,
  doc.title,
  doc.category,
  doc.crew_type as "crewType",
  doc.builder,
  doc.model,
  doc.model_canonical as "modelCanonical",
  doc.operator,
  doc.base_id as "baseId",
  doc.base_name as "baseName",
  doc.city,
  doc.location,
  doc.region,
  doc.country,
  doc.lat,
  doc.lng,
  doc.base_email as "baseEmail",
  doc.base_phone as "basePhone",
  doc.base_website as "baseWebsite",
  doc.base_check_in_time as "baseCheckInTime",
  doc.base_check_out_time as "baseCheckOutTime",
  doc.length_m as "lengthM",
  doc.cabins,
  doc.berths,
  doc.heads,
  doc.year_built as "yearBuilt",
  doc.sail_type as "sailType",
  doc.security_deposit_minor as "securityDepositMinor",
  doc.security_deposit_currency as "securityDepositCurrency",
  doc.deposit_insurance_included as "depositInsuranceIncluded",
  doc.pets_allowed as "petsAllowed",
  doc.rating,
  doc.review_count as "reviewCount",
  ${engagementColumns},
  doc.main_image as "mainImage",
  doc.gallery,
  doc.amenities,
  doc.price_from_minor as "priceFromMinor",
  doc.currency,
  doc.available_from as "availableFrom",
  doc.available_to as "availableTo",
  doc.bookable_from as "bookableFrom",
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
  if (!skip.has("city") && input.city?.length) {
    parts.push(normalizedIn(sql`doc.city`, input.city));
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
  if (!skip.has("builder") && input.builder?.length) {
    parts.push(normalizedIn(sql`doc.builder`, input.builder));
  }
  if (!skip.has("model") && input.model?.length) {
    parts.push(
      sql`(${normalizedIn(sql`doc.model`, input.model)} or ${normalizedIn(sql`doc.model_canonical`, input.model)} or ${normalizedIn(sql`doc.builder`, input.model)})`,
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
    /*
     * Containment against one free stretch, not against one enumerated period. The old filter
     * asked a single availability_slot row to span the whole request, and no synthesized slot ran
     * longer than a week, so every multi-week search returned nothing at all while dozens of
     * listings had the consecutive weeks free.
     *
     * No check-in weekday here. Search is a funnel: it answers "is this boat free then", and
     * the rules decide the exact charter on the detail page. A listing should not vanish from
     * results because the visitor's dates start on a Tuesday, when the honest answer is "free
     * that week, and it starts on Saturdays".
     */
    parts.push(sql`exists (
      select 1
      from listing_free_period free
      where free.listing_id = doc.listing_id
        and free.start_date <= ${availabilityWindow.checkIn}
        and free.end_date >= ${availabilityWindow.checkOut}
    )`);
  }
  /*
   * Length is different from the weekday above, and is filtered even with no dates attached.
   * The weekday is a constraint the visitor never mentioned, so applying it would drop a boat
   * for a reason they did not ask about. A duration is a constraint they chose: a boat whose
   * shortest charter is a week cannot serve a three-day trip, and listing it under "3 days"
   * promises something the quote will refuse.
   *
   * A listing with no published rule is kept, matching `availability-rules.ts`: the rules are
   * what the provider stated, and inventing one here would hide dates it would happily sell.
   */
  if (!skip.has("duration") && input.duration) {
    parts.push(sql`(
      not exists (select 1 from listing_checkin_rule rule where rule.listing_id = doc.listing_id)
      or exists (
        select 1
        from listing_checkin_rule rule
        where rule.listing_id = doc.listing_id
          and (rule.min_nights is null or rule.min_nights <= ${input.duration})
          and (rule.max_nights is null or rule.max_nights >= ${input.duration})
      )
    )`);
  }
  return sql.join(parts, sql` and `);
}

function cursorClause(
  sort: SearchSort = "recommended",
  cursor: DecodedSearchCursor | undefined,
): SQL {
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

  return decorateFacetOptions(db, rows.rows, kind, input.locale);
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

  return decorateFacetOptions(db, rows.rows, "equipment", input.locale);
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
  locale?: string,
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
    label: string | null;
    description: string | null;
  }>(sql`
    select
      ${normalizedSql(sql`media.value`)} as key,
      media.image_url as "imageUrl",
      media.cloudinary_id as "cloudinaryId",
      translation.label,
      coalesce(translation.description, media.description) as description
    from facet_media media
    left join facet_media_translation translation
      on translation.facet_media_id = media.id
      and translation.locale = ${locale ?? DEFAULT_LOCALE}
    where media.kind = ${kind}
  `);
  const byKey = new Map(media.rows.map((row) => [row.key, row]));

  return options.map((option) => {
    /*
     * Matched on the untranslated label, and `value` above was derived from it too:
     * `value` is what the search filters compare against doc.country / doc.category,
     * so only the display label may be swapped for a translation.
     */
    const match = byKey.get(normalizedFilterValue(option.label));
    return {
      ...option,
      label: match?.label ?? option.label,
      imageUrl: match?.imageUrl ?? null,
      cloudinaryId: match?.cloudinaryId ?? null,
      description: match?.description ?? null,
    };
  });
}

function labelsFromOptions(options: ListingFacetOption[]): string[] {
  return options.map((option) => option.label);
}

/**
 * The optional extras this listing will actually price, as canonical codes.
 *
 * The quote path checks a selection against this rather than trusting the client:
 * an unrecognised code used to be persisted onto the quote and then dropped by the
 * adapter, which billed nothing and told nobody.
 */
export async function listSelectableExtraCodes(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
): Promise<Set<string>> {
  const rows = await db.execute<{ source: string; kind: string; externalId: string }>(sql`
    select source, kind, external_id as "externalId"
    from provider_extra_catalogue
    where listing_id = ${listingId} and obligatory = false
  `);

  return new Set(
    rows.rows
      .filter((row) => isSelectableExtra(row.source, row.kind))
      .map((row) => `${row.kind}:${row.externalId}`),
  );
}

/**
 * Whether the booking flow may offer this extra as a priced choice.
 *
 * This is provider knowledge sitting in the read model because the dependency runs
 * the other way: `packages/providers` imports this package. It mirrors what the
 * adapters can actually match a selection against, so it has to be revisited
 * whenever one of them learns a new id space.
 *
 * - mock keeps one flat code space and prices anything in it.
 * - NauSYS offers key on `serviceId`; no recorded offer has ever carried the
 *   `extraId` shape, so an `equipment` code has nothing to match against.
 * - Booking Manager publishes optional extras in its catalogue but exposes none on
 *   the offer it quotes from, so none of them can be priced.
 */
function isSelectableExtra(source: string, kind: string): boolean {
  if (source === "mock") return true;
  if (source === "nausys") return kind === "service";
  return false;
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

/**
 * The value a facet option is selected by, which is not `toSlug`.
 *
 * Diacritics are left alone here on purpose: the filter match normalizes both sides by stripping
 * non-alphanumerics, so "Mali Lošinj" folds to `maliloinj` on the column and this has to fold the
 * same way. Folding the accent instead would produce `malilosinj` and match nothing. Catalogue
 * page URLs use `toSlug`, which does fold, because a URL is read by people.
 */
export function valueForLabel(label: string): string {
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

/** An aggregate bound as it leaves pg: numeric columns arrive as strings, and an
 * aggregate over no rows arrives as null. */
type AggregateBound = number | string | null | undefined;

type NumericRange = { min: number; max: number };

function numberRange(min: AggregateBound, max: AggregateBound): NumericRange {
  const normalizedMin = numberOrZero(min);
  const normalizedMax = numberOrZero(max);

  return {
    min: Math.min(normalizedMin, normalizedMax),
    max: Math.max(normalizedMin, normalizedMax),
  };
}

function numberOrZero(value: AggregateBound): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boatAgeRange(yearRange: NumericRange): NumericRange {
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
