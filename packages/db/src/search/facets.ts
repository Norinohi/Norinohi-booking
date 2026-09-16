import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { FX_BASE_CURRENCY } from "../fx/rates";
import { availabilityWindowFor } from "./candidate-range";
import { currentYear, valueForLabel, whereClause, type FacetFilterKey } from "./filters";
import { DEFAULT_LOCALE } from "./localize";
import {
  normalizedKey as normalizedFilterValue,
  normalizedKeySql as normalizedSql,
} from "./normalize";
import {
  comparablePrice,
  pricedForDates,
  pricedNights,
  publishedPrice,
  searchDocs,
} from "./pricing-sql";
import { MIN_LEAD_DAYS } from "./lead-time";
import type {
  FacetMediaKind,
  ListingFacets,
  ListingFacetOption,
  ListingSearchInput,
  PriceBasis,
} from "./types";

type FacetOptionRow = {
  label: string;
  count: number;
  priceFromMinor: number | null;
  pricePerPersonWeekMinor: number | null;
  currency: string | null;
};

/*
 * Where the length slider ends, as a share of the fleet rather than its longest hull.
 *
 * The slider is a control, not a census. Read off `max(length_m)` its track ran to 157 m, a
 * single hull, and 99% of the catalogue sat inside the first fifth of it -- so the choice
 * between a 44-, a 46- and a 50-footer, which is the choice people actually make here, was
 * three pixels wide. Nothing above the cap becomes unreachable: a thumb resting on the end of
 * its slider sends no upper bound at all (apps/web/src/features/yachts/lib/to-search-input.ts),
 * so the top of the track reads "and longer".
 *
 * `percentile_disc` rather than `percentile_cont` so the end of the track is the length of a
 * boat somebody is letting, not an interpolation between two of them.
 */
const LENGTH_CAP_PERCENTILE = 0.95;

/*
 * Where the age slider's older end sits, and how far back the year selects list.
 *
 * The mirror of LENGTH_CAP_PERCENTILE: 0.05 leaves the oldest 5% of the fleet outside the
 * control, the same share 0.95 leaves off the long end. Read off `min(year_built)` the range
 * started at 1926, one hull, and the age slider offered a hundred years for a fleet whose
 * boats are almost all under twenty-five. The end of the slider writes "any" rather than a
 * bound (apps/web/src/components/shared/form/filters/lib/boat-age.ts), so the older end reads
 * "and older" and nothing built before the cap stops being findable.
 */
const OLDEST_YEAR_PERCENTILE = 0.05;

/*
 * Where the price slider ends, on the same reading as LENGTH_CAP_PERCENTILE.
 *
 * The dearest charter in the catalogue is half a million euros. Anchored on it the slider
 * opened on a band 95% of the fleet sits in the first twentieth of, and the first thing a
 * visitor read about our prices was a number almost nobody here is shopping for. The end of
 * the track sends no upper bound, so the expensive tail stays reachable; it just stops
 * setting the scale everyone else is measured against.
 *
 * The home page's budget buckets divide this same range, and its last bucket ends on the cap,
 * which `upperOf` reads as no bound at all -- so that bucket reads "and up" for free.
 */
const PRICE_CAP_PERCENTILE = 0.95;

/* The lengths people ask for most, listed first; every other length up to a month follows. */
const POPULAR_DURATIONS = [3, 7, 10, 14];
const MAX_LISTED_DURATION = 31;

const DEFAULT_DURATIONS: ListingFacetOption[] = [
  /* Leads the list so the field opens on "no length stated" and `clearTo` resets to it. */
  { value: "any", label: "Any duration" },
  ...[
    ...POPULAR_DURATIONS,
    ...Array.from({ length: MAX_LISTED_DURATION }, (_, index) => index + 1).filter(
      (days) => !POPULAR_DURATIONS.includes(days),
    ),
  ].map((days) => ({ value: String(days), label: days === 1 ? "1 day" : `${days} days` })),
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
    listFacetOptions(db, input, sql`coalesce(doc.model, doc.builder)`, ["model", "query"], "model"),
    listFacetOptions(db, input, sql`doc.crew_type`, ["crew"], "crew"),
    listFacetOptions(db, input, sql`doc.sail_type`, ["mainsailType"], "sail_type"),
    listEquipmentFacetOptions(db, input),
    /* `nullif` for the same reason the range filters it: a year of zero is "not stated", and it
       was being offered as a selectable build year in the dropdown. */
    listFacetOptions(db, input, sql`nullif(doc.year_built, 0)::text`, ["yearFrom", "yearTo"]),
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
      hasDepositInsurance: boolean | null;
      hasPetsAllowed: boolean | null;
      hasBestValue: boolean | null;
      currency: string | null;
    }>(sql`
      select
        min(doc.length_m) as "minLength",
        /* Capped rather than maxed -- see LENGTH_CAP_PERCENTILE. Zero is how a vendor writes a
           length it does not know, so it is left out of the ordering the same way an unknown
           build year is left out of the year range below. */
        percentile_disc(${LENGTH_CAP_PERCENTILE}::double precision) within group (order by doc.length_m)
          filter (where doc.length_m > 0) as "maxLength",
        min(doc.cabins) as "minCabins",
        max(doc.cabins) as "maxCabins",
        min(doc.berths) as "minBerths",
        max(doc.berths) as "maxBerths",
        min(doc.heads) as "minBathrooms",
        max(doc.heads) as "maxBathrooms",
        /* Filtered the same way the cap below is, and for the reason stated there: a
           non-positive figure is a vendor saying "no price", never "free". Two listings publish
           a zero charter rate beside real fees, and an unfiltered minimum put a EUR 0 end on
           the slider the moment the catalogue started comparing rates. */
        min(${comparablePrice(input.priceBasis)}) filter (
          where ${comparablePrice(input.priceBasis)} > 0 and ${pricedForDates(input)}
        ) as "minMinor",
        /* Capped rather than maxed -- see PRICE_CAP_PERCENTILE. A non-positive figure is a
           vendor saying "no price", never "free", so it is left out of the ordering. */
        percentile_disc(${PRICE_CAP_PERCENTILE}::double precision) within group (
          order by ${comparablePrice(input.priceBasis)}
        ) filter (
          where ${comparablePrice(input.priceBasis)} > 0 and ${pricedForDates(input)}
        ) as "maxMinor",
        /* Zero is how a vendor writes a build year it does not know, and it reached the range as
           a real one: the age slider then offered "up to 2026 years old". Filtered rather than
           coalesced, because a fleet where nobody stated a year has no range to show.
           Capped rather than minned on the old end -- see OLDEST_YEAR_PERCENTILE. */
        percentile_disc(${OLDEST_YEAR_PERCENTILE}::double precision) within group (
          order by doc.year_built
        ) filter (where doc.year_built > 0) as "minYear",
        max(doc.year_built) filter (where doc.year_built > 0) as "maxYear",
        min(doc.rating) as "minRating",
        max(doc.rating) as "maxRating",
        bool_or(doc.deposit_insurance_included) as "hasDepositInsurance",
        bool_or(doc.pets_allowed) as "hasPetsAllowed",
        bool_or(doc.best_value) as "hasBestValue"
      from ${searchDocs(input)} doc
      where ${whereClause(input)}
    `),
  ]);
  const row = rangeRows.rows[0];
  /*
   * The bounds are read off price_from_minor_eur, so the slider is in that currency whatever
   * the fleet publishes in. Taking the label from min(doc.currency) instead put a euro sign on
   * a range whose ends came from two currencies, and sent a euro bound to a dollar comparison.
   */
  const priceRange = {
    minMinor: row?.minMinor ?? 0,
    maxMinor: row?.maxMinor ?? 0,
    currency: FX_BASE_CURRENCY,
  };
  const yearRange = numberRange(row?.minYear, row?.maxYear);
  /*
   * The selects list the same window the slider spans. Left whole they offered a hundred
   * entries to pick a build year from, and the two controls over one constraint disagreed
   * about where it started.
   */
  const yearsInRange = years
    .filter((option) => Number(option.value) >= yearRange.min)
    /* Newest first: the current year is the one people reach for, and the facet read hands them
       back in ascending order, which buried it at the bottom of a twenty-odd entry list. */
    .sort((a, b) => Number(b.value) - Number(a.value));

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
      years: [{ value: "any", label: "Any year" }, ...yearsInRange],
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
      /*
       * Whether the control has anything to widen, which is whether the search named dates at
       * all. A `bool_or` over the results cannot answer it: the boats this toggle would add are
       * the ones the same where clause has just excluded.
       */
      underTemporaryBooking: availabilityWindowFor(input) !== undefined,
      depositInsurance: row?.hasDepositInsurance ?? false,
      petsAllowed: row?.hasPetsAllowed ?? false,
      bestValue: row?.hasBestValue ?? false,
    },
    priceRange,
  };
}

/*
 * Destination prices share the catalogue's EUR comparison currency, preferring the published
 * integer where the listing already publishes in it -- an unconverted figure is exact, and the
 * converted one only exists to make the rest comparable with it.
 *
 * Mirrored for the charter rate rather than left on the all-in pair: a "from" price on a
 * destination card that quoted the total while every listing card beside it quoted the rate
 * would put two different questions under the same heading.
 */
const facetComparablePrice = (basis?: PriceBasis): SQL =>
  sql`case when doc.currency = ${FX_BASE_CURRENCY}
  then ${publishedPrice(basis)} else ${comparablePrice(basis)} end`;
/*
 * "From X per person/week" on a destination card: each boat's price put on that footing first --
 * stretched to the week its nights cover (the count the price sort divides by) and shared across
 * the party it can take -- rather than the cheapest charter divided afterwards.
 *
 * The 5th percentile of those, not the minimum. A country holds thousands of boats and the minimum
 * is whichever row the vendor got wrong: Spain read "from EUR 0" off a boat rated at EUR 1 with its
 * money in the charter pack, Greece "from EUR 25" off a EUR 200 placeholder with nothing to sell.
 * Only boats that could back the figure take part: a charter priced for its own dates that has not
 * lapsed. A boat rate below a quarter of the all-in price is already read as no rate at all (see
 * `MIN_BASE_SHARE_OF_ALL_IN`), so the EUR 1 trick counts at its all-in price. The lapse matters because `pricedNights` reads a lapsed charter as a week: a
 * one-night Caribbean rate that had passed was counted as a week's price and read "from EUR 38".
 */
const PER_PERSON_WEEK_PERCENTILE = 0.05;

const facetPriceColumns = (input: ListingSearchInput): SQL => {
  const basis = input.priceBasis;
  return sql`
      min(${facetComparablePrice(basis)})
        filter (where ${facetComparablePrice(basis)} > 0 and ${pricedForDates(input)})
        as "priceFromMinor",
      round(
        (percentile_cont(${PER_PERSON_WEEK_PERCENTILE}::double precision) within group (
          order by ${facetComparablePrice(basis)} * 7.0 / ${pricedNights} / doc.max_guests
        ) filter (
          where ${facetComparablePrice(basis)} > 0
            and ${pricedForDates(input)}
            and doc.max_guests > 0
            and not doc.price_is_from
            and doc.bookable_from >= current_date + cast(${MIN_LEAD_DAYS} as int)
        ))::numeric
      )::integer as "pricePerPersonWeekMinor",
      ${FX_BASE_CURRENCY}::text as currency`;
};

async function listFacetOptions(
  db: NodePgDatabase<typeof schema>,
  input: ListingSearchInput,
  expression: SQL,
  ignored: readonly FacetFilterKey[],
  kind?: FacetMediaKind,
): Promise<ListingFacetOption[]> {
  const rows = await db.execute<FacetOptionRow>(sql`
    select
      ${modalLabel(expression)} as label,
      count(*)::integer as count,${facetPriceColumns(input)}
    from ${searchDocs(input)} doc
    where ${whereClause(input, ignored)}
      and ${expression} is not null
    group by ${normalizedSql(expression)}
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
      ${modalLabel(sql`amenity.value`)} as label,
      count(distinct doc.listing_id)::integer as count,${facetPriceColumns(input)}
    from ${searchDocs(input)} doc
    cross join lateral jsonb_array_elements_text(doc.amenities) amenity(value)
    where ${whereClause(input, ["equipment"])}
      and amenity.value is not null
    group by ${normalizedSql(sql`amenity.value`)}
    order by label asc
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
    pricePerPersonWeekMinor: row.pricePerPersonWeekMinor,
    currency: row.currency,
  }));

  if (!kind || options.length === 0) return options;

  const media = await db.execute<{
    key: string;
    imageUrl: string | null;
    hoverImageUrl: string | null;
    gridUsesHoverImage: boolean;
    cloudinaryId: string | null;
    label: string | null;
    description: string | null;
    popularRank: number | null;
    featuredRank: number | null;
    filterVisible: boolean;
  }>(sql`
    select
      ${normalizedSql(sql`media.value`)} as key,
      media.image_url as "imageUrl",
      media.hover_image_url as "hoverImageUrl",
      media.grid_uses_hover_image as "gridUsesHoverImage",
      media.cloudinary_id as "cloudinaryId",
      translation.label,
      coalesce(translation.description, media.description) as description,
      media.popular_rank as "popularRank",
      media.featured_rank as "featuredRank",
      media.filter_visible as "filterVisible"
    from facet_media media
    left join facet_media_translation translation
      on translation.facet_media_id = media.id
      and translation.locale = ${locale ?? DEFAULT_LOCALE}
    where media.kind = ${kind}
  `);
  const byKey = new Map(media.rows.map((row) => [row.key, row]));

  /*
   * The curated allowlist, when the kind has one.
   *
   * Applied here rather than in each facet query because this is the one place that already
   * holds both halves -- the grouped options and the facet_media rows -- so restricting the
   * list costs nothing more than it already spends. Counts are computed before the cut, which
   * is what we want: a removed option was never a filter anyone applied, so nothing it counted
   * moves anywhere else.
   *
   * An empty allowlist means the kind is uncurated and every option stands. That is the state
   * eight of the nine kinds are in, and the state a fresh database starts in, so the check is
   * against the marked rows rather than against a flag somewhere else.
   */
  const allowed = new Set(media.rows.filter((row) => row.filterVisible).map((row) => row.key));
  const visible =
    allowed.size === 0
      ? options
      : options.filter((option) => allowed.has(normalizedFilterValue(option.label)));

  return visible.map((option) => {
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
      hoverImageUrl: match?.hoverImageUrl ?? null,
      gridUsesHoverImage: match?.gridUsesHoverImage ?? true,
      cloudinaryId: match?.cloudinaryId ?? null,
      description: match?.description ?? null,
      /*
       * The rank rides along rather than reordering the group. Options stay label-ascending
       * because a facet list is also the source for the panel's chips and its active-filter
       * count, both of which compare against option order; the caller that wants a pinned
       * "Popular" group partitions on this field instead.
       */
      popularRank: match?.popularRank ?? null,
      featuredRank: match?.featuredRank ?? null,
    };
  });
}

function labelsFromOptions(options: ListingFacetOption[]): string[] {
  return options.map((option) => option.label);
}

/**
 * The spelling most of a facet group's listings use, for a group keyed on `normalizedSql`.
 *
 * Facets are grouped the way `normalizedIn` filters, or the two disagree about what one value
 * is: "ACE Yachting" and "Ace Yachting" were two options carrying 13 listings each, and picking
 * either answered with all 26. The same split put "Motor yacht" (400) beside "Motoryacht" (155)
 * in the boat types, and a marina under both "Pula / Marina Polesana" and "Pula, Marina
 * Polesana". One row per value now, counted the way the filter counts.
 *
 * `mode()` rather than `min()` because the label is what a person reads: the spelling the
 * operator uses on most of its hulls beats whichever sorts first.
 */
function modalLabel(value: SQL): SQL {
  return sql`mode() within group (order by ${value})`;
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

  const year = currentYear();
  return {
    min: Math.max(year - yearRange.max, 0),
    max: Math.max(year - yearRange.min, 0),
  };
}
