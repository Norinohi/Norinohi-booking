import { sql, type SQL } from "drizzle-orm";

import {
  availabilityWindowFor,
  candidateRange,
  FLEXIBILITY_DAYS,
  nightsBetween,
  shiftDays,
  todayUtc,
  UNDATED_SEARCH_HORIZON_DAYS,
  undatedRange,
  type CandidateRange,
} from "./candidate-range";
import { MIN_LEAD_DAYS, providerLeadDaysSql } from "./lead-time";
import { lengthPriceTier, pricedLengthStart } from "./length-charter-sql";
import type { ListingSearchInput } from "./types";

/*
 * Whether this listing would actually sell a charter starting on the day the visitor named.
 *
 * `whereClause` deliberately does not filter on the check-in weekday -- the reasoning is on
 * `checkinRuleClause`, and filtering it turns a Wednesday search of 3,396 boats into 412. The
 * cost of keeping them is that the card then captions a Saturday-to-Saturday hull with the
 * visitor's Wednesday dates and links to them, and the detail page refuses the period with no
 * explanation. So search still answers "free that week", and this column is what lets the card
 * say the other half out loud: "and it starts on Saturdays".
 *
 * True for every row of an undated search, and for a listing whose offers publish no rule at
 * all, matching how `checkinRuleClause` treats an absent rule: what the provider did not state
 * is not a refusal.
 */
export function sellsRequestedPeriodColumn(input: ListingSearchInput): SQL {
  const window = availabilityWindowFor(input);
  if (!window && input.duration) {
    /*
     * A length with no date: the card still has to name a charter of that length. Left to the
     * listing's own first sellable period, a "7 days" search captioned a boat "1 day, 15-16 Sep",
     * because that was the shortest thing its operator happened to have free first. A priced
     * charter of the asked-for length, else the nearest one from the earliest bookable day, is
     * the honest answer (`pricedLengthStart`).
     */
    const range = undatedRange(input.duration);
    const named = sql`coalesce(${pricedLengthStart(input.duration)}, ${nearestSellableStart(range.earliestStart, input.duration, range)})`;
    return sql`, true as "sellsRequestedPeriod", ${named} as "nearestCheckIn",
      (${named} + ${input.duration}::integer) as "nearestCheckOut",
      ${lengthPriceTier(input.duration)} as "lengthPriceTier"`;
  }
  if (!window) {
    return sql`, true as "sellsRequestedPeriod"${nextCharterAfterLapseColumns()}`;
  }

  const nights = nightsBetween(window);
  return sql`, ${sellsWindow(window, nights)} as "sellsRequestedPeriod"${nearestSellableColumns(window, nights, candidateRange(window, nights, FLEXIBILITY_DAYS[input.dateFlexibility ?? "on-day"]))}`;
}

/*
 * Free as well as allowed. On the rules alone a boat with none was taken to sell a week it had
 * booked: a flexible search admitted Noelle Bavaria 38 for its free week three days later, and the
 * card named the booked dates asked for, "on request", instead of the week it does sell.
 */
function sellsWindow(window: { checkIn: string; checkOut: string }, nights: number): SQL {
  return sql`(
    (${rulesSellWindow(sql`doc.listing_id`, sql`${window.checkIn}::date`, nights)}
      and exists (
        select 1
        from listing_offer o
        join listing_free_period free on free.listing_offer_id = o.id
        where o.listing_id = doc.listing_id
          and o.status = 'active'
          and free.start_date <= ${window.checkIn}::date
          and free.end_date >= ${window.checkOut}::date
      ))
    or exists (${vendorCharters(nights, { earliestStart: window.checkIn, latestStart: window.checkIn, earliestEnd: window.checkOut, latestEnd: window.checkOut }, "row")})
  )`;
}

/**
 * The first day of the charter a dated card names, for the price lookup in `searchDocs` to key on.
 *
 * `periodFor` in packages/api picks those dates from `sellsRequestedPeriod` and `nearestCheckIn`:
 * the dates asked for where this listing sells them, else the nearest charter it does sell. Pricing
 * only the dates asked for left every card moved onto a nearby week "on request", 2,699 of 4,495
 * for one flexible September search, although a vendor had priced most of those weeks. The same
 * choice made here lets the card, the sort, the price filter, the slider and the map read one
 * figure for the charter on screen.
 *
 * Without flexibility the nearest start can only be the day asked for, so nothing is looked up.
 * Where no nearer start is found the day asked for stands, which is also where the card falls
 * back: to the bookable charter, which the swap moves onto these dates only when they are priced.
 */
export function shownCharterStart(
  input: ListingSearchInput,
): { checkIn: SQL; nights: number; perRow: boolean } | undefined {
  const window = availabilityWindowFor(input);
  if (!window) return undefined;

  const nights = nightsBetween(window);
  const requested = sql`${window.checkIn}::date`;
  const flex = FLEXIBILITY_DAYS[input.dateFlexibility ?? "on-day"];
  if (flex === 0) return { checkIn: requested, nights, perRow: false };

  const nearest = sql`coalesce(${nearestSellableStart(window.checkIn, nights, candidateRange(window, nights, flex))}, ${requested})`;
  /* A start date alone names no charter to contradict, so the card shows the nearest outright. */
  const namesCharter = Boolean((input.checkIn && input.checkOut) || input.duration);
  return {
    checkIn: namesCharter
      ? sql`case when ${sellsWindow(window, nights)} then ${requested} else ${nearest} end`
      : nearest,
    nights,
    perRow: true,
  };
}

/*
 * Whether the check-in rules of the listing's active offers admit exactly this charter, reading
 * no rule at all as no refusal. Shared with the price-list rate in `list-rate-sql.ts`, so a card
 * the rules move onto other dates is never priced from the list for the dates it no longer shows.
 */
export function rulesSellWindow(listingId: SQL, checkIn: SQL, nights: number): SQL {
  const checkOut = sql`(${checkIn} + ${nights}::integer)`;
  return sql`(
    not exists (
      select 1
      from listing_offer o
      join listing_checkin_rule rule on rule.listing_offer_id = o.id
      where o.listing_id = ${listingId} and o.status = 'active'
    )
    or exists (
      select 1
      from listing_offer o
      join listing_checkin_rule rule on rule.listing_offer_id = o.id
      where o.listing_id = ${listingId}
        and o.status = 'active'
        and (rule.season_start is null or rule.season_start <= ${checkIn})
        and (rule.season_end is null or rule.season_end >= ${checkIn})
        and (rule.checkin_weekday is null
             or rule.checkin_weekday = extract(dow from ${checkIn}))
        and (rule.checkout_weekday is null
             or rule.checkout_weekday = extract(dow from ${checkOut}))
        and (rule.min_nights is null or rule.min_nights <= ${nights})
        and (rule.max_nights is null or rule.max_nights >= ${nights})
    )
  )`;
}

/*
 * The charter this boat would sell closest to the dates asked for.
 *
 * `bookable_from` is the listing's first sellable charter anywhere in the horizon, which is the
 * wrong answer to "not these dates, then when?" -- a September search offered a boat's November
 * week as its alternative, two months from the trip somebody was planning.
 *
 * A candidate start is a free stretch's own beginning walked forward to the next weekday the
 * rule turns over on, which is arithmetic rather than a scan over days: `d + ((wanted - dow(d) +
 * 7) % 7)`. It has to fit inside that same stretch -- the stretch it was derived from, not any
 * stretch the listing owns -- and start inside a published rate, so what comes back is free and
 * on sale on the one offer that would sell it.
 *
 * Every shape of rule `checkinRuleClause` admits has to produce a start here too, or search and
 * card disagree: this used to skip rules with no check-in weekday and offers with no rule at all,
 * so "1 day" admitted exactly the boats it could never name a charter for, and each card fell
 * back to its stored week. A rule fixing only the check-out day steps the start so the charter
 * ends on it; a rule fixing neither, or no rule, starts on the stretch's first day. The start
 * also has to fall inside the rule's own season, which is when that rule governs it.
 */
function sellableStarts(nights: number | SQL, range: CandidateRange): SQL {
  return sql`
    ${ruleStarts(nights, range, "row")}

    union all

    /*
     * And every charter of this length the vendor itself priced as free, whatever our copy of its
     * rules says, as the projection and rangeStatus both take it; see vendorCharterClause.
     */
    select o.listing_id, slot.start_date, slot.end_date, o.id, true
    from listing_offer o
    join provider p on p.id = o.provider_id
    join availability_slot slot on slot.listing_offer_id = o.id
    where o.listing_id = doc.listing_id
      and o.status = 'active'
      and ${vendorCharterClause(nights, range, providerLeadDaysSql(sql`p.code`))}
  `;
}

/* The starts the check-in rules derive from the free stretches. */
function ruleStarts(nights: number | SQL, range: CandidateRange, scope: ListingScope): SQL {
  return sql`
    select o.listing_id, c.start_date, free.end_date, o.id as offer_id, false as vendor
    from listing_offer o
    join provider p on p.id = o.provider_id
    join listing_free_period free on free.listing_offer_id = o.id
    ${ruleStartSources(nights, range)}
    where ${ofListing(scope)}
      and o.status = 'active'
      and ${ruleStartConditions(nights, range)}
  `;
}

/* The same starts on offer `o` of provider `p` alone, for walking the offers one at a time. */
function ruleStartsOfOffer(nights: number, range: CandidateRange): SQL {
  return sql`
    select c.start_date, free.end_date, o.id as offer_id, false as vendor
    from listing_free_period free
    ${ruleStartSources(nights, range)}
    where free.listing_offer_id = o.id
      and ${ruleStartConditions(nights, range)}
  `;
}

function ruleStartSources(nights: number | SQL, range: CandidateRange): SQL {
  /* The range starts at the shared floor; a vendor needing longer notice starts later. */
  const notice = providerLeadDaysSql(sql`p.code`);
  const opens = sql`greatest(free.start_date, ${range.earliestStart}::date, rule.season_start, current_date + ${notice})`;
  return sql`
    left join listing_checkin_rule rule on rule.listing_offer_id = o.id
    cross join lateral (
      select (case
        when rule.checkin_weekday is not null then
          ${opens} + ((rule.checkin_weekday - extract(dow from ${opens})::integer + 7) % 7)
        when rule.checkout_weekday is not null then
          ${opens} + ((rule.checkout_weekday - extract(dow from ${opens} + ${nights}::integer)::integer + 7) % 7)
        else ${opens}
      end)::date as start_date
    ) c
  `;
}

function ruleStartConditions(nights: number | SQL, range: CandidateRange): SQL {
  return sql`
      free.end_date >= ${range.earliestStart}::date + ${nights}::integer
      and free.start_date <= ${range.latestStart}::date
      and (rule.season_end is null or c.start_date <= rule.season_end)
      and (rule.min_nights is null or rule.min_nights <= ${nights})
      and (rule.max_nights is null or rule.max_nights >= ${nights})
      and (
        rule.checkin_weekday is null
        or rule.checkout_weekday is null
        or mod(${nights} - rule.checkout_weekday + rule.checkin_weekday + 70, 7) = 0
      )
  `;
}

/*
 * Which listings a charter subquery answers for. A card column asks about the row in hand, and
 * runs only for the rows a page returns. A filter asks about every listing at once and tests
 * membership: correlated, the same subquery re-ran for each of eighteen thousand documents.
 */
type ListingScope = "row" | "set";

function ofListing(scope: ListingScope): SQL {
  return scope === "row" ? sql`o.listing_id = doc.listing_id` : sql`true`;
}

/*
 * A charter of `nights` on offer `o`, starting inside `range`, that the vendor priced as free and
 * nothing has taken since.
 *
 * The check-in rules are not consulted. They are our transcription of what the vendor sells, and
 * the vendor's own answer outranks it: one Booking Manager operator lists Monday and Friday and
 * sells every weekday, and 11,700 weeks it priced were refused on the check-in day.
 */
function vendorCharterClause(nights: number | SQL, range: CandidateRange, notice: SQL): SQL {
  return sql`(
        slot.availability_confirmed
        and slot.status = 'available'
        and slot.price_minor is not null
        and slot.end_date - slot.start_date = ${nights}::integer
        /* Repeated outside the greatest, where an index on the start can bound the scan by it. */
        and slot.start_date >= ${range.earliestStart}::date
        and slot.start_date >= greatest(${range.earliestStart}::date, current_date + ${notice})
        and slot.start_date <= ${range.latestStart}::date
        and not exists (
          select 1 from availability_slot taken
          where taken.listing_offer_id = slot.listing_offer_id
            and taken.status <> 'available'
            and taken.start_date < slot.end_date
            and taken.end_date > slot.start_date
        )
      )`;
}

/* Whether any offer of the listing holds such a charter, for the filters. */
export function hasVendorCharter(nights: number, range: CandidateRange): SQL {
  const listings = isWide(range)
    ? everyOfferWith(sql`
        select 1
        from availability_slot slot
        where slot.listing_offer_id = o.id
          and ${vendorCharterClause(nights, range, providerLeadDaysSql(sql`p.code`))}`)
    : vendorCharters(nights, range, "set");
  return sql`doc.listing_id in (${listings})`;
}

/*
 * How many days of starts make reading every candidate in the range dearer than walking the
 * offers and stopping at each one's first. A year of vendor-priced weeks is 380,000 slots, each
 * checked for a booking over it, for 17,000 listings that nearly all have one in the first weeks;
 * a single check-in day is a few thousand slots, cheaper than eighteen thousand offer probes.
 */
const WIDE_RANGE_DAYS = 31;

function isWide(range: CandidateRange): boolean {
  return (
    nightsBetween({ checkIn: range.earliestStart, checkOut: range.latestStart }) > WIDE_RANGE_DAYS
  );
}

/* The listings with an active offer `o`, of provider `p`, for which `charter` finds a row. */
function everyOfferWith(charter: SQL): SQL {
  return sql`
    select o.listing_id
    from listing_offer o
    join provider p on p.id = o.provider_id
    cross join lateral (${charter} limit 1) found
    where o.status = 'active'
  `;
}

function vendorCharters(nights: number, range: CandidateRange, scope: ListingScope): SQL {
  return sql`
    select o.listing_id
    from listing_offer o
    join provider p on p.id = o.provider_id
    join availability_slot slot on slot.listing_offer_id = o.id
    where ${ofListing(scope)}
      and o.status = 'active'
      and ${vendorCharterClause(nights, range, providerLeadDaysSql(sql`p.code`))}
  `;
}

/*
 * The charter has to sit inside the stretch it came from, and inside a rate somebody published.
 *
 * Correlated on the candidate's own offer rather than on the listing, for both reasons: it is
 * the offer that would sell this charter, so its rate is the one that settles it, and keying on
 * `listing_offer_id` lets the lookup ride `listing_price_period_uq` instead of scanning a
 * million-row table by listing.
 */
function sellableFilter(nights: number | SQL): SQL {
  return sql`
      c.start_date + ${nights}::integer <= c.end_date
      and (c.vendor or exists (
        select 1
        from listing_price_period r3
        where r3.listing_offer_id = c.offer_id
          and r3.start_date <= c.start_date
          and r3.end_date >= c.start_date
      ))`;
}

/*
 * One free stretch wide enough for the whole charter, on an offer whose rules would sell it.
 *
 * Shared by the filter and by the card column that says a week is only held: the two have to
 * ask the same question, or a card would announce a hold on a boat the filter admitted as free.
 */
export function freeAcrossWindow(
  range: CandidateRange,
  windowNights: number,
  nights: number | undefined,
  scope: ListingScope = "row",
): SQL {
  const offers = sql`
    select o.listing_id
    from listing_offer o
    join listing_free_period free
      on free.listing_offer_id = o.id
     and free.start_date <= ${range.latestStart}
     and free.end_date >= ${range.earliestEnd}
     and free.end_date - free.start_date >= ${windowNights}
    where ${ofListing(scope)}
      and o.status = 'active'
      and ${nights ? checkinRuleClause(nights, range) : sql`true`}
  `;
  return scope === "row" ? sql`exists (${offers})` : sql`doc.listing_id in (${offers})`;
}

/* Every slot overlapping the charter the visitor named, of one status or all the others. */
function slotsOverWindow(window: { checkIn: string; checkOut: string }, option: boolean): SQL {
  return sql`
    select slot.end_date, slot.option_expires_at
    from availability_slot slot
    where slot.listing_id = doc.listing_id
      and slot.status ${option ? sql`=` : sql`<>`} 'option'
      and slot.start_date < ${window.checkOut}::date
      and slot.end_date > ${window.checkIn}::date`;
}

/*
 * The requested charter is held under a temporary booking, and that is the only thing in its way.
 *
 * Asked against the dates the visitor named rather than the range their flexibility opens, which
 * the free branch already covers: this one answers "the week you asked for is on hold", and a
 * hold three days either side of it is not that.
 *
 * The check-in rule is still applied -- a hull that turns around on Saturdays is no more an
 * answer to a Wednesday when its Saturday is held -- but the free-period tests are not, because
 * the hold is exactly why there is no free period to find. What stands in for them is the second
 * half: nothing else overlaps the week, so releasing the hold leaves it free.
 */
export function heldOnlyByOption(
  window: { checkIn: string; checkOut: string },
  nights: number | undefined,
  range: CandidateRange,
): SQL {
  return sql`(
    exists (${slotsOverWindow(window, true)})
    and not exists (${slotsOverWindow(window, false)})
    and exists (
      select 1
      from listing_offer o
      where o.listing_id = doc.listing_id
        and o.status = 'active'
        and ${nights ? checkinRuleClause(nights, range) : sql`true`}
    )
  )`;
}

/*
 * The hold over the searched week, and when the vendor drops it, for the card to count down to.
 *
 * Null unless the hold is the whole story: a boat with a free stretch across those dates is
 * available, whatever else its calendar holds elsewhere. Selected rather than filtered on, so
 * it is computed for the rows a page returns and not for every candidate.
 *
 * The week reopens only once every option over it lapses, so the latest deadline is the one
 * that counts, and a single option without a stated deadline leaves the answer unknown. It is
 * not the held charter's end date, which is what this used to print: that is the day somebody
 * else's week finishes, not the day this one might come free.
 *
 * Formatted in SQL because the column carries no zone and is written in UTC; left to the
 * driver, it would be read back in the server's local time.
 */
export function temporaryHoldColumn(input: ListingSearchInput): SQL {
  const window = availabilityWindowFor(input);
  if (!window) return sql`, null::json as "temporaryHold"`;

  const windowNights = nightsBetween(window);
  const flex = FLEXIBILITY_DAYS[input.dateFlexibility ?? "on-day"];
  const range = candidateRange(window, windowNights, flex);
  const nights = input.checkIn && input.checkOut ? windowNights : input.duration;
  return sql`, case
    when ${freeAcrossWindow(range, windowNights, nights)} then null
    else (
      select json_build_object(
        'expiresAt',
        case when bool_and(held.option_expires_at is not null)
          then to_char(max(held.option_expires_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        end
      )
      from (${slotsOverWindow(window, true)}) held
    )
  end as "temporaryHold"`;
}

/*
 * Whether the rules sell anything inside the horizon, as the set of listings they do rather than
 * the nearest start below, which only has to run for the rows a page actually returns.
 *
 * Without the vendor's own charters, which `sellableStarts` also yields: every filter ORs
 * `hasVendorCharter` over the same length and range beside this, and carrying them here too
 * computed that set twice per query.
 */
export function hasRuleSellableStart(nights: number, range: CandidateRange): SQL {
  const listings = isWide(range)
    ? everyOfferWith(sql`
        select 1
        from (${ruleStartsOfOffer(nights, range)}) c
        where c.start_date <= ${range.latestStart}::date
          and ${sellableFilter(nights)}`)
    : sql`
        select c.listing_id
        from (${ruleStarts(nights, range, "set")}) c
        where c.start_date <= ${range.latestStart}::date
          and ${sellableFilter(nights)}`;
  return sql`doc.listing_id in (${listings})`;
}

function nearestSellableColumns(
  window: { checkIn: string; checkOut: string },
  nights: number,
  range: CandidateRange,
): SQL {
  const nearest = nearestSellableStart(window.checkIn, nights, range);
  return sql`, ${nearest} as "nearestCheckIn", (${nearest} + ${nights}::integer) as "nearestCheckOut"`;
}

/*
 * Nearest to the day asked for, which the tolerance allows to fall either side of it -- the
 * same reading `candidateRange` gives the free-period test. Ordered by distance rather than
 * taken as a `min`, because the earliest start inside a fortnight's tolerance is not the one
 * closest to the trip somebody described.
 */
export function nearestSellableStart(
  checkIn: string,
  nights: number | SQL,
  range: CandidateRange,
): SQL {
  return sql`(
    select c.start_date
    from (${sellableStarts(nights, range)}) c
    where c.start_date <= ${range.latestStart}::date
      and ${sellableFilter(nights)}
    order by abs(c.start_date - ${checkIn}::date), c.start_date
    limit 1
  )`;
}

/*
 * The charter a card falls back to when the stored first one has lapsed.
 *
 * `bookable_from` is projected by the availability sync, so between runs the day it names can
 * pass, and the card then had no dates, a "seasonal minimum" caption and an "On request" chip
 * for a boat that sells the following week. The next charter of the same length from the
 * earliest bookable day is what the next sync would store; computing it here only for the lapsed
 * rows keeps the cost off the fleet whose stored charter still stands.
 */
export function nextCharterAfterLapseColumns(): SQL {
  const earliest = shiftDays(todayUtc(), MIN_LEAD_DAYS);
  const nights = sql`greatest(doc.bookable_to - doc.bookable_from, 1)`;
  const lapsed = sql`doc.bookable_from is not null and doc.bookable_from < ${earliest}::date`;
  const next = nearestSellableStart(earliest, nights, {
    earliestStart: earliest,
    latestStart: shiftDays(earliest, UNDATED_SEARCH_HORIZON_DAYS),
    earliestEnd: earliest,
    latestEnd: shiftDays(earliest, UNDATED_SEARCH_HORIZON_DAYS),
  });
  return sql`, case when ${lapsed} then ${next} end as "nearestCheckIn",
    case when ${lapsed} then ${next} + ${nights} end as "nearestCheckOut"`;
}

/*
 * Whether offer `o` publishes a rule that would sell a charter of `nights`, on one of the days
 * `range` covers when dates are known.
 *
 * A listing with no published rule is kept, matching `availability-rules.ts`: the rules are
 * what the provider stated, and inventing one here would hide dates it would happily sell.
 *
 * The season bounds are the point of the dates. Rules are written per season, and a hull that
 * is Saturday to Saturday, seven nights all year commonly carries a single relaxed week --
 * one night, any weekday -- for a shoulder-season gap. Read without their seasons those rules
 * say the boat sells three nights in August, and the quote then refuses the charter the card
 * promised. `availability-writer.ts` applies the same bounds before it records a refusal.
 *
 * A rule that names both turnaround days states a length, whether or not it fills in
 * `min_nights`: a charter starting Saturday and ending Saturday is seven nights, or fourteen,
 * never three or ten. That is `nights = checkout_weekday - checkin_weekday (mod 7)`, and it is
 * the test `rangeStatus` already applies when the quote is asked -- so leaving it out here is
 * search promising a charter the quote then refuses. It is the whole reason a Saturday-to-
 * Saturday hull answered "3 days", and why "10 days" returned all 18,534 listings on the
 * strength of `min_nights = 7 <= 10`; with the length read, 791 and 1,391 of them can do it.
 *
 * Only the rule's own columns are read, never a stored date, which is what keeps this clear of
 * the caveat in `availability-writer.ts`: NauSYS writes a period's end as the last night and
 * Booking Manager as the check-out morning, so the two disagree about a date by a day but not
 * about the weekday a rule names.
 *
 * With no check-in date the season is pinned to the span the boat is still free for instead.
 * Six of the top ten results for a bare "3 days" were passing on a relaxed week of
 * 2026-05-02..08 that had closed three months before, on hulls with nothing free until
 * October. Measured against the span rather than against each free stretch: overlapping the
 * stretches one by one costs a correlated scan per rule and tripled the unfiltered browse to
 * a second, to admit seven listings whose relaxed season lands in a booked gap.
 */
export function checkinRuleClause(
  nights: number,
  range: CandidateRange | undefined,
  listing: SQL = sql`doc`,
): SQL {
  const season = range
    ? sql`and (rule.season_start is null or rule.season_start <= ${range.latestStart}::date)
              and (rule.season_end is null or rule.season_end >= ${range.earliestStart}::date)`
    : sql`and (rule.season_end is null or rule.season_end >= greatest(${listing}.available_from, current_date))
              and (rule.season_start is null or rule.season_start <= ${listing}.available_to)`;

  return sql`(
          not exists (
            select 1 from listing_checkin_rule rule where rule.listing_offer_id = o.id
          )
          or exists (
            select 1
            from listing_checkin_rule rule
            where rule.listing_offer_id = o.id
              ${season}
              and (
                rule.checkin_weekday is null
                or rule.checkout_weekday is null
                or mod(${nights} - rule.checkout_weekday + rule.checkin_weekday + 70, 7) = 0
              )
              and (rule.min_nights is null or rule.min_nights <= ${nights})
              and (rule.max_nights is null or rule.max_nights >= ${nights})
          )
        )`;
}
