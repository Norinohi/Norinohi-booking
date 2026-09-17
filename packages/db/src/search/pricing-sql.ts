import { getTableColumns, sql, type SQL } from "drizzle-orm";

import { listingSearchDoc } from "../schema/search";
import { availabilityWindowFor } from "./candidate-range";
import { MIN_LEAD_DAYS } from "./lead-time";
import { listRatePeriodPrice } from "./list-rate-sql";
import { PERIOD_PRICE_COLUMNS } from "./period-prices";
import { shownCharterStart } from "./sellable-starts";
import type { ListingSearchDoc, ListingSearchInput, PeriodPriceSource, PriceBasis } from "./types";

const NULL_PRICE_ASC = 2_147_483_647;

/**
 * The smallest share of the all-in price a boat rate may be and still count as the boat's price.
 *
 * Some vendors put almost the whole charter into the obligatory pack and publish a nominal rate:
 * the Angelmiles Maxus 35s read EUR 1 against EUR 386 all-in. Taken as the boat price that sorted
 * them first in "cheapest first" and printed "Boat price EUR 1" on the card. Below this share the
 * rate is treated like a missing one, and the all-in figure stands in everywhere a rate is read:
 * the sort, the price filter and its bounds, and the card (`presentListingSummary`).
 */
export const MIN_BASE_SHARE_OF_ALL_IN = 0.25;

/**
 * How far "cheapest first" moves a boat with no charter priced for its own dates.
 *
 * Its figure is a seasonal floor, or a charter that has lapsed, and either can be far below what
 * the boat actually sells for: Paxos' EUR 200 "week" with nothing to sell headed Greece. So the
 * order is the priced charters, cheapest first, then those floors, cheapest first. One integer
 * rather than a second sort column because the keyset cursor compares one value; nightly minor
 * units stay far below the offset, and the sum below `NULL_PRICE_ASC`.
 */
export const UNPRICED_CHARTER_SORT_OFFSET = 1_000_000_000;
const NULL_PRICE_DESC = -1;
export const NULL_YEAR_DESC = 0;

/**
 * The documents a search reads, priced for the charter each dated card names where anyone priced it.
 *
 * That charter is the dates asked for, or on a flexible search the nearest one the listing sells
 * instead (`shownCharterStart`). The vendor's own price for it wins; failing that, the operator's
 * published rate for that exact week, or for any other length an estimate from that list
 * (`listRatePeriodPrice`). `price_source` says which, and a listing none of them prices reads its
 * document as stored, which is the price of that listing's own week. An undated search reads every
 * document as stored.
 *
 * The inner alias is `doc` because the charter lookups are written against it.
 */
export function searchDocs(input: ListingSearchInput): SQL {
  const window = availabilityWindowFor(input);
  const shown = shownCharterStart(input);
  if (!window || !shown) return sql`listing_search_doc`;

  const columns = Object.values(getTableColumns(listingSearchDoc)).map(({ name }) => {
    const priced = PERIOD_PRICE_COLUMNS.get(name);
    const column = sql.identifier(name);
    return priced
      ? sql`case when pp.listing_id is null then doc.${column} else ${priced} end as ${column}`
      : sql`doc.${column}`;
  });

  const checkIn = shown.perRow ? sql`shown.check_in` : shown.checkIn;
  const listRate = listRatePeriodPrice(sql`doc.listing_id`, checkIn, shown.nights);

  return sql`(
    select ${sql.join(columns, sql`, `)},
      pp.listing_id is not null as priced_for_dates,
      pp.price_source,
      coalesce(pp.start_date <> ${window.checkIn}::date, false) as priced_for_nearby_dates
    from listing_search_doc doc
    ${
      shown.perRow
        ? /* `offset 0` keeps it a subquery, computed once per row rather than at every use. */
          sql`cross join lateral (select ${shown.checkIn} as check_in offset 0) shown`
        : sql``
    }
    left join lateral (
      (
        select
          vendor.listing_id,
          vendor.start_date,
          vendor.end_date,
          vendor.offer_id,
          vendor.currency,
          vendor.all_in_minor,
          vendor.all_in_minor_eur,
          vendor.base_minor,
          vendor.base_minor_eur,
          vendor.list_all_in_minor,
          'vendor'::text as price_source
        from listing_period_price vendor
        where vendor.listing_id = doc.listing_id
          and vendor.start_date = ${checkIn}
          and vendor.end_date = ${checkIn} + ${shown.nights}::integer
      )
      ${listRate ? sql`union all (${listRate})` : sql``}
      limit 1
    ) pp on true
  )`;
}

/**
 * Whether a row carries a price for the charter its card names on a dated search, from the vendor
 * or from the operator's list for that week: the dates asked for, or the nearby ones shown instead.
 *
 * Always true on an undated search, which names no dates to price. On a dated one the rest are
 * priced for another week or from the season, and a figure for another week is not a price for
 * these dates: ranked or filtered beside the real ones, a EUR 7,000 week in September sorted
 * above a EUR 7,200 quote for the dates asked for, and passed a price filter those dates fail.
 */
export function pricedForDates(input: ListingSearchInput): SQL {
  return availabilityWindowFor(input) ? sql`doc.priced_for_dates` : sql`true`;
}

/**
 * The rows `priceDescSortValue` lifts above the rest: the ones priced for the searched dates, and
 * none at all on an undated search, so its sort values stay what its cursors already carry.
 */
export function liftedForDates(input: ListingSearchInput): SQL {
  return availabilityWindowFor(input) ? sql`doc.priced_for_dates` : sql`false`;
}

/** The same flags for the card, so the keyset cursor can restate the order in JS. */
export function pricedForDatesColumn(input: ListingSearchInput): SQL {
  return availabilityWindowFor(input)
    ? sql`, doc.priced_for_dates as "pricedForDates", doc.price_source as "priceSource",
        doc.priced_for_nearby_dates as "pricedForNearbyDates"`
    : sql``;
}

/**
 * `nightlyPriceValue` in the units the keyset cursor compares.
 *
 * It has to agree with the SQL to the unit: the cursor is the last row's sort value, and a page
 * boundary computed from a different number either skips rows or serves them twice. Postgres
 * `round(numeric)` and `Math.round` both go half away from zero, and every figure here is
 * positive, so the two land on the same integer.
 */
export function nightlyPriceOf(
  item: Pick<
    ListingSearchDoc,
    "priceFromMinorEur" | "basePriceFromMinorEur" | "priceIsFrom" | "bookableFrom" | "bookableTo"
  >,
  basis: PriceBasis = "all_in",
): number | null {
  /* The SQL's `coalesce(nullif(...))`, restated: a zero rate is not a price, and the cursor has
     to divide the same figure the ORDER BY did or the page boundary lands in the wrong place. */
  const rate = item.basePriceFromMinorEur;
  const allIn = item.priceFromMinorEur;
  const usableRate =
    rate !== null && rate > 0 && (allIn === null || rate >= allIn * MIN_BASE_SHARE_OF_ALL_IN);
  const comparable = basis === "base" && usableRate ? rate : allIn;
  if (comparable === null) return null;

  const sellable = hasPricedCharter(item);

  const nights =
    sellable && item.bookableFrom && item.bookableTo
      ? Math.round(
          (Date.parse(`${item.bookableTo}T00:00:00.000Z`) -
            Date.parse(`${item.bookableFrom}T00:00:00.000Z`)) /
            86_400_000,
        )
      : ASSUMED_PRICED_NIGHTS;

  return Math.round(comparable / Math.max(nights, 1));
}

/** The SQL's sellable test in `pricedNights` and `priceAscSortValue`, restated for the cursor. */
function hasPricedCharter(item: Pick<ListingSearchDoc, "priceIsFrom" | "bookableFrom">): boolean {
  const earliest = new Date(Date.now() + MIN_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
  return !item.priceIsFrom && item.bookableFrom !== null && item.bookableFrom >= earliest;
}

/** `priceAscSortValue` in the units the keyset cursor compares. */
export function priceAscSortValueOf(
  item: Parameters<typeof nightlyPriceOf>[0] & Pick<ListingSearchDoc, "pricedForDates">,
  basis: PriceBasis = "all_in",
): number {
  const nightly = nightlyPriceOf(item, basis);
  if (nightly === null) return NULL_PRICE_ASC;
  const pricedHere = hasPricedCharter(item) && item.pricedForDates !== false;
  return nightly + (pricedHere ? 0 : UNPRICED_CHARTER_SORT_OFFSET);
}

/** `priceDescSortValue` in the units the keyset cursor compares. */
export function priceDescSortValueOf(
  item: Parameters<typeof nightlyPriceOf>[0] & Pick<ListingSearchDoc, "pricedForDates">,
  basis: PriceBasis = "all_in",
): number {
  const nightly = nightlyPriceOf(item, basis);
  if (nightly === null) return NULL_PRICE_DESC;
  return nightly + (item.pricedForDates === true ? UNPRICED_CHARTER_SORT_OFFSET : 0);
}

/*
 * Ordered on the converted column, and paired with the cursor values in `cursorFor`: the two
 * have to read the same expression or a keyset page skips or repeats rows. A listing with no
 * usable rate sorts with the unpriced ones, which is what "we cannot compare this" looks like.
 */
/**
 * Recommended: a charter the vendor has priced outranks one we can only start a price from.
 *
 * Rating alone put the indicative cards first, because the weeks the confirming sweep had not
 * reached were the well-rated ones -- 49 of the first 60 results. A visitor comparing prices is
 * better served by a figure the quote will match, so a confirmed price is worth more than any
 * rating gap, and the sort settles that before it looks at the stars.
 *
 * Folded into one number rather than added as a second key so the keyset cursor stays a single
 * comparable value; the +10 clears the 0..5 rating range with room to spare.
 */
export const recommendedSortValue = sql`case when doc.price_is_from then doc.rating else doc.rating + 10 end`;

/* Each clears the 0..5 rating range, so a tier is settled before the stars are read. */
const VENDOR_PRICED_RANK = 30;
const LIST_PRICED_RANK = 20;
const ESTIMATE_PRICED_RANK = 10;
/* Clears the widest gap between two sources plus the rating range. */
const ASKED_DATES_RANK = 30;

/**
 * `recommendedSortValue` for a search that may name dates.
 *
 * On a dated search the price that counts is the one for those dates. A listing priced only for
 * another week shows "on request" beside them, so ranking it with the priced ones filled the first
 * page of a November search with cards that had no price while the six boats a vendor had priced
 * for that week sat further down.
 *
 * The vendor's price for the week outranks the operator's list rate for it, because the quote will
 * match the first and both vendors sell below the second, and the list rate for a week outranks an
 * estimate from it for another length, which the quote can miss further still. Any of them for the
 * dates asked for outranks any for the nearby charter a flexible search moved the card onto: both
 * are priced, but only the first is the trip as described.
 */
export function recommendedSortValueFor(input: ListingSearchInput): SQL {
  return availabilityWindowFor(input)
    ? sql`case
        when doc.price_source is null then doc.rating
        else doc.rating
          + case doc.price_source
              when 'vendor' then ${VENDOR_PRICED_RANK}::integer
              when 'price-list' then ${LIST_PRICED_RANK}::integer
              else ${ESTIMATE_PRICED_RANK}::integer
            end
          + case when doc.priced_for_nearby_dates then 0 else ${ASKED_DATES_RANK}::integer end
      end`
    : recommendedSortValue;
}

const SOURCE_RANK = {
  vendor: VENDOR_PRICED_RANK,
  "price-list": LIST_PRICED_RANK,
  "price-list-estimate": ESTIMATE_PRICED_RANK,
  "price-list-estimate-from": ESTIMATE_PRICED_RANK,
  "price-list-estimate-before-discounts": ESTIMATE_PRICED_RANK,
} satisfies Record<PeriodPriceSource, number>;

/** `recommendedSortValueFor` in the units the keyset cursor compares. */
export function recommendedSortValueOf(
  item: Pick<
    ListingSearchDoc,
    "priceIsFrom" | "pricedForDates" | "priceSource" | "pricedForNearbyDates" | "rating"
  >,
): number {
  if (item.pricedForDates === undefined) return (item.priceIsFrom ? 0 : 10) + Number(item.rating);
  if (item.priceSource === null || item.priceSource === undefined) return Number(item.rating);
  const source = SOURCE_RANK[item.priceSource];
  return source + (item.pricedForNearbyDates ? 0 : ASKED_DATES_RANK) + Number(item.rating);
}

/**
 * The charter length assumed where the row names no sellable one.
 *
 * A week, matching `WEEKLY_RATE_DAYS` in the API's listing presenter, which falls back the same
 * way on the same row. Restated here rather than imported: `packages/db` sits below
 * `packages/api` and cannot reach up into it.
 */
const ASSUMED_PRICED_NIGHTS = 7;

/**
 * The nights `price_from_minor_eur` covers, and never zero.
 *
 * `pricedPeriodDays` in the API's listing presenter, as SQL. It has to be the same count: the
 * card divides by that one to print a nightly rate, and the sort divides by this one to order
 * the cards, so any disagreement puts the list in an order its own figures contradict.
 *
 * Two conditions, both from there. A "from" figure is the season's weekly floor whatever dates
 * sit beside it, so its period is a week -- Casanova's EUR 41,000 floor advertises a single
 * night and would otherwise have sorted as EUR 41,000 a night against its true EUR 5,857. And
 * a period that has lapsed or fallen inside the lead time is dropped upstream, which leaves the
 * same weekly fallback.
 */
export const pricedNights = sql`greatest(
  coalesce(
    case
      when not doc.price_is_from
        and doc.bookable_from >= current_date + cast(${MIN_LEAD_DAYS} as int)
      then doc.bookable_to - doc.bookable_from
    end,
    ${ASSUMED_PRICED_NIGHTS}
  ),
  1
)`;

/**
 * Price sorted per night, not per charter.
 *
 * The stored figure prices whatever charter the listing was quoted for, and those are not the
 * same length: a three-night charter at 819 EUR sorted above a week at 865, so the first page of
 * "Price: low to high" opened with the most expensive boats on it -- 273 EUR a night above 124.
 * Dividing by the nights the figure covers is the only basis on which the rows compare, because
 * nothing here can restate one charter's price as another's (see the money lateral in
 * `read-model.ts`: prorating a weekly band into three nights read 3,450 against a vendor quote
 * of 1,621, so the arithmetic that would let us sort on a common length does not exist).
 *
 * `round` to a whole minor unit rather than carrying the fraction, so the keyset cursor can hold
 * the sort value as the integer it compares -- `cursorFor` computes the identical number in JS.
 * Both round half away from zero, and every value here is positive.
 */
/**
 * Which of the document's two prices every comparison reads, and the rule that keeps a page
 * coherent: whichever figure the cards show, the sort, the filter and the "from" aggregates
 * read the same one.
 *
 * Split them and the first card is not the cheapest of the ones on screen, and the slider hides
 * boats whose visible price is inside the range it names -- both true of every page at once,
 * which is why the basis travels with the request rather than being decided per query.
 *
 * A zero rate falls back to the all-in figure, which is what the card does with it: two vendors
 * publish real fees against a rate of nought, and read literally they sorted to the top of
 * "cheapest first" as free boats while their cards showed the price they actually charge.
 */
export function comparablePrice(basis: PriceBasis = "all_in"): SQL {
  // Native EUR needs no conversion. Seeded or older rows may not have the derived EUR column.
  // Other currencies still require that column; an unavailable rate must never be guessed.
  const allIn = sql`coalesce(doc.price_from_minor_eur,
    case when doc.currency = 'EUR' then doc.price_from_minor end)`;
  return basis === "base" ? sql`coalesce(${basePriceInEur()}, ${allIn})` : allIn;
}

export function basePriceInEur(): SQL {
  const base = sql`coalesce(nullif(doc.base_price_from_minor_eur, 0),
    case when doc.currency = 'EUR' then nullif(doc.base_price_from_minor, 0) end)`;
  const allIn = sql`coalesce(doc.price_from_minor_eur,
    case when doc.currency = 'EUR' then doc.price_from_minor end)`;
  return sql`case when ${allIn} is null
    or ${base} >= ${allIn} * ${MIN_BASE_SHARE_OF_ALL_IN}::numeric then ${base} end`;
}

/** The published figure, in whatever currency the vendor quoted. Rendered, never compared. */
export const publishedPrice = (basis: PriceBasis = "all_in"): SQL =>
  basis === "base"
    ? sql`coalesce(
        case when doc.base_price_from_minor >= doc.price_from_minor * ${MIN_BASE_SHARE_OF_ALL_IN}::numeric
          then nullif(doc.base_price_from_minor, 0) end,
        doc.price_from_minor
      )`
    : sql`doc.price_from_minor`;

const nightlyPriceValue = (basis?: PriceBasis): SQL =>
  sql`round(${comparablePrice(basis)}::numeric / ${pricedNights})`;

export const priceAscSortValue = (basis: PriceBasis | undefined, pricedHere: SQL): SQL =>
  sql`coalesce(
    ${nightlyPriceValue(basis)} + case
      when not doc.price_is_from
        and doc.bookable_from >= current_date + cast(${MIN_LEAD_DAYS} as int)
        and ${pricedHere}
      then 0 else ${UNPRICED_CHARTER_SORT_OFFSET} end,
    ${NULL_PRICE_ASC}
  )`;
/* Dearest first, among the prices for the searched dates and then among the rest. */
export const priceDescSortValue = (basis: PriceBasis | undefined, liftedHere: SQL): SQL =>
  sql`coalesce(
    ${nightlyPriceValue(basis)} + case
      when ${liftedHere} then ${UNPRICED_CHARTER_SORT_OFFSET} else 0 end,
    ${NULL_PRICE_DESC}
  )`;
export const yearDescSortValue = sql`coalesce(doc.year_built, ${NULL_YEAR_DESC})`;
