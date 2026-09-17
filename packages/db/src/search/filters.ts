import { sql, type SQL } from "drizzle-orm";

import {
  availabilityWindowFor,
  candidateRange,
  FLEXIBILITY_DAYS,
  nightsBetween,
  undatedRange,
} from "./candidate-range";
import {
  foldedLetters,
  normalizedKey as normalizedFilterValue,
  normalizedKeySql as normalizedSql,
  placeWordsKey,
  placeWordsKeySql,
} from "./normalize";
import { comparablePrice, pricedForDates } from "./pricing-sql";
import {
  checkinRuleClause,
  freeForSearch,
  hasRuleSellableStart,
  hasVendorCharter,
  heldOnlyByOption,
} from "./sellable-starts";
import { coveredBySlotHold, overlapsSlotHold } from "./slot-holds";
import type { ListingSearchInput } from "./types";

export type FacetFilterKey = keyof ListingSearchInput;

/*
 * Read per query, not once at import. Boat age is a distance from today, so a
 * constant captured at module load turns every age filter and the age slider's
 * own bounds off by one on the first of January, on a server that has been up
 * since December.
 */
export function currentYear(): number {
  return new Date().getUTCFullYear();
}

/**
 * How many words of a free-text search are honoured.
 *
 * Every word costs its own `ilike` over the same text, and a search phrased in more than this many
 * has already named the boat. The cap is what stops a pasted paragraph from turning one request
 * into a scan the database pays for word by word.
 */
const MAX_FREE_TEXT_WORDS = 8;

/**
 * A free-text match over everything a card shows: the boat's own name, and the searchable text
 * behind it, which carries the title, model, builder, charter company, base and the rest.
 *
 * Word by word, all of them required, in any order. Typing what is printed on the card
 * ("Alegria Dufour 382 GL") has to find it, and so does half of it, and so does a model with a
 * charter company after it — none of which a single substring over the whole phrase can do,
 * because the columns spell those things in an order nobody typing is obliged to guess.
 */
function freeTextClause(text: string | undefined): SQL | null {
  const words = text?.trim().split(/\s+/).slice(0, MAX_FREE_TEXT_WORDS) ?? [];
  if (words.length === 0 || words[0] === "") return null;

  const haystack = sql`concat_ws(' ', doc.name, doc.searchable_text)`;
  return sql.join(
    words.map((word) => sql`${haystack} ilike ${`%${word}%`}`),
    sql` and `,
  );
}

export function whereClause(
  input: ListingSearchInput,
  ignored: readonly FacetFilterKey[] = [],
): SQL {
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
  if (!skip.has("name")) {
    const match = freeTextClause(input.name);
    if (match) parts.push(match);
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
      sql`(${placeWordsIn(sql`doc.base_name`, input.marina)} or ${normalizedIn(sql`doc.base_id`, input.marina)})`,
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
  /*
   * Matched on what the boat can be sold to, not on what it sleeps. A vendor may cap a product
   * below the berth count and publish the cap nowhere, so `max_guests` carries the berths less
   * whatever it has already refused; where nothing has been refused the two are the same.
   */
  if (!skip.has("guests") && input.guests) {
    parts.push(sql`coalesce(doc.max_guests, doc.berths) >= ${input.guests}`);
  }
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
  /*
   * Zero is "not stated", the same reading the facets take of it, so a listing carrying one is
   * not measured against a year at all. Only the upper bounds needed saying: nothing built in
   * year zero passes `>= 1990`, but `<= 1930` let all ninety of the yearless listings through,
   * and "built before 1930" answered with boats whose year nobody knows. Written on every one
   * of the four so a bound that reaches zero from the other side -- a hand-edited `yearFrom=0`,
   * an age wider than the calendar -- cannot reopen it.
   */
  const withStatedYear = (bound: ReturnType<typeof sql>) => sql`(doc.year_built > 0 and ${bound})`;
  if (!skip.has("yearFrom") && input.yearFrom !== undefined) {
    parts.push(withStatedYear(sql`doc.year_built >= ${input.yearFrom}`));
  }
  if (!skip.has("yearTo") && input.yearTo !== undefined) {
    parts.push(withStatedYear(sql`doc.year_built <= ${input.yearTo}`));
  }
  if (!skip.has("minBoatAge") && input.minBoatAge !== undefined) {
    parts.push(withStatedYear(sql`doc.year_built <= ${currentYear() - input.minBoatAge}`));
  }
  if (!skip.has("maxBoatAge") && input.maxBoatAge !== undefined) {
    parts.push(withStatedYear(sql`doc.year_built >= ${currentYear() - input.maxBoatAge}`));
  }
  /*
   * Both bounds arrive in FX_BASE_CURRENCY, matching the range facet that produced the slider,
   * so they are compared against the converted column. A listing with no usable rate has a null
   * there and drops out of a bounded search rather than being measured against a bound in a
   * currency it does not share.
   */
  if (!skip.has("minPriceMinor") && input.minPriceMinor) {
    parts.push(
      sql`${pricedForDates(input)} and ${comparablePrice(input.priceBasis)} >= ${input.minPriceMinor}`,
    );
  }
  if (!skip.has("maxPriceMinor") && input.maxPriceMinor) {
    parts.push(
      sql`${pricedForDates(input)} and ${comparablePrice(input.priceBasis)} <= ${input.maxPriceMinor}`,
    );
  }
  if (!skip.has("depositInsurance") && input.depositInsurance) {
    parts.push(sql`doc.deposit_insurance_included = true`);
  }
  if (!skip.has("petsAllowed") && input.petsAllowed) parts.push(sql`doc.pets_allowed = true`);
  if (!skip.has("bestValue") && input.bestValue) parts.push(sql`doc.best_value = true`);
  const availabilityWindow = availabilityWindowFor(input);
  const windowNights = availabilityWindow ? nightsBetween(availabilityWindow) : undefined;
  /*
   * The length the visitor actually asked about, which is not the same as the width of the
   * window searched. A pair of explicit dates states one. The duration facet states one. A start
   * date alone states none -- `availabilityWindowFor` still spans a week from it, because a date
   * has to mean something, but a boat is not dropped for a length nobody named. That is the
   * funnel again, the same reasoning as the check-in weekday below.
   */
  const statedNights = input.checkIn && input.checkOut ? windowNights : input.duration;
  const nights = skip.has("duration") ? undefined : statedNights;
  if (availabilityWindow && windowNights !== undefined) {
    const flex = skip.has("dateFlexibility")
      ? 0
      : FLEXIBILITY_DAYS[input.dateFlexibility ?? "on-day"];
    const range = candidateRange(availabilityWindow, windowNights, flex);
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
     *
     * The free stretch and the length rule are asked of the same offer. Split across the listing
     * they vouched for each other: the vendor selling by the night had the week taken, the vendor
     * with the week free sells it Saturday to Saturday, and the pair read as three nights free.
     *
     * The three date tests are `max(free.start, earliestStart) <= min(free.end - nights,
     * latestStart)` -- is there a day in the range the visitor would accept where a charter of
     * their length still fits inside this stretch -- rewritten as plain comparisons so the
     * (offer, start_date, end_date) index can serve them. `greatest`/`least` over the columns
     * reads closer to the intent but is opaque to the planner.
     */
    /*
     * A charter this listing would actually sell, near the dates asked for.
     *
     * Free and sellable are different questions, and the free-period test alone answers only
     * the first: a hull whose season opens in November is free all September, because nobody
     * books a boat that is not on sale. 935 of 3,386 results for one mid-September week were
     * in that state, shown with their November rate against September dates.
     *
     * Bounded by the tolerance the visitor stated, not by a horizon invented here. "On day"
     * means that day: a boat that turns around on Saturdays is not an answer to a Wednesday,
     * and shifting it three days anyway is the Date Flexibility control making its own
     * decision. The same bound already governs the free-period test through `candidateRange`,
     * so a listing cannot pass one and fail the other.
     *
     * Unbounded, this is what offered a September search a November week.
     */
    const free = freeForSearch(range, windowNights, nights);
    /*
     * A temporary booking is occupancy, so the week it covers is not among the free stretches
     * and its boat is not an answer to this search. The toggle is the visitor saying they want
     * to see those anyway: a hold is the one thing in the way that can still lapse, and a
     * customer who would take the boat if it did is better served by a card that says so than
     * by silence. Nothing else is relaxed -- a week somebody has actually booked stays gone.
     */
    parts.push(
      !skip.has("underTemporaryBooking") && input.underTemporaryBooking
        ? sql`(${free} or ${heldOnlyByOption(availabilityWindow, nights, range)})`
        : free,
    );
    /*
     * A free period is the provider's last word, which is up to a sync cycle old. Our own
     * live checkouts are current, so they come off here rather than waiting to be told.
     *
     * Asked as overlap against one named charter and as coverage against a flexible range, for
     * the reason `coveredBySlotHold` carries: on exact dates any hold on them is the end of it,
     * while a visitor open to a fortnight is only out of luck when the holds leave no day.
     */
    parts.push(
      flex === 0
        ? sql`not ${overlapsSlotHold(sql`doc.listing_id`, availabilityWindow.checkIn, availabilityWindow.checkOut)}`
        : sql`not ${coveredBySlotHold(sql`doc.listing_id`, range.earliestStart, range.latestEnd)}`,
    );
  } else if (nights) {
    /*
     * Length is different from the weekday above, and is filtered even with no dates attached.
     * The weekday is a constraint the visitor never mentioned, so applying it would drop a boat
     * for a reason they did not ask about. A duration is a constraint they chose: a boat whose
     * shortest charter is a week cannot serve a three-day trip, and listing it under "3 days"
     * promises something the quote will refuse.
     *
     * With no date to place it in, the rule still has to describe a charter somebody could
     * book: its season has to reach a stretch the boat is actually free. A relaxed week last
     * May is not an answer to "three days" when the boat is Saturday to Saturday from here on.
     */
    const range = undatedRange(nights);
    /*
     * The stored document supplies the span the season is pinned to. An undated search reads
     * the documents as stored, so it is the row `doc` stands for.
     */
    const ruled = sql`doc.listing_id in (
      select o.listing_id
      from listing_offer o
      join listing_search_doc stored on stored.listing_id = o.listing_id
      where o.status = 'active'
        and ${checkinRuleClause(nights, undefined, sql`stored`)}
    )`;
    /*
     * And a charter of that length the boat actually has free within the horizon, found the
     * way the card finds the one it names. The rule test above says the operator sells three
     * nights; it cannot say any three nights are free, so a boat booked solid or selling that
     * length only in a lapsed season passed, and its card fell back to a week. The rule test
     * stays in front as the cheap cut, and so does the stored charter: where the projection
     * already found one of this length it is proof enough, and for a week that is nearly the
     * whole fleet, which otherwise paid a second or more for the scan on every search.
     */
    parts.push(sql`(
      (${ruled} and (
        (doc.bookable_from >= ${range.earliestStart}::date
          and doc.bookable_to - doc.bookable_from = ${nights})
        or ${hasRuleSellableStart(nights, range)}
      ))
      or ${hasVendorCharter(nights, range)}
    )`);
  }
  return sql.join(parts, sql` and `);
}

/**
 * The value a facet option is selected by, which is not `toSlug`.
 *
 * Folds accents rather than dropping them, because the value has to survive `normalizedKey` on
 * the way back in: a dropped letter leaves a key the column's own fold can never produce, and
 * every accented base in the catalogue answered its own marina filter with nothing. "Dènia /
 * Marina El Portet" was a pin counting nine boats above a list that found none of them.
 */
export function valueForLabel(label: string): string {
  return foldedLetters(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* A marina matches by its words in any order, as the map and the typeahead group it. */
function placeWordsIn(column: SQL, values: string[]): SQL {
  const keys = values.map(placeWordsKey).filter(Boolean);
  if (keys.length === 0) return sql`false`;

  return sql`${placeWordsKeySql(column)} in (${sql.join(
    keys.map((key) => sql`${key}`),
    sql`, `,
  )})`;
}

function normalizedIn(column: SQL, values: string[]): SQL {
  const normalizedValues = values.map(normalizedFilterValue).filter(Boolean);
  if (normalizedValues.length === 0) return sql`false`;

  return sql`${normalizedSql(column)} in (${sql.join(
    normalizedValues.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}
