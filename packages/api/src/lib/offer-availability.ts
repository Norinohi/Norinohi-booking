/*
 * The same questions `availability-rules.ts` answers, asked of a yacht several vendors sell.
 *
 * That module stays untouched and per-offer, because that is exactly what a constraint set
 * is: one provider's calendar, one provider's rules, one provider's refusals. Folding two
 * vendors' rows into one set would invent a boat neither sells — Saturday check-ins from one
 * and a free week from the other, combined into a charter nobody would honour.
 *
 * So the sets stay apart and the answers are combined here. The customer sees one card, so
 * the rule throughout is: a day is offered if any offer can deliver it.
 */

import {
  addDays,
  type CharterConstraints,
  type DatePeriod,
  type OccupiedPeriod,
  type RangeVerdict,
  canCheckIn,
  covers,
  firstBookablePeriod,
  legalCheckOuts,
  offeredCheckOut,
  rangeStatus,
} from "./availability-rules";

export type OfferConstraints = CharterConstraints & {
  offerId: string;
  providerCode: string;
};

export type CombinedVerdict = {
  verdict: RangeVerdict;
  /** Which offer would sell it. Null when none would. */
  offerId: string | null;
};

export type CombinedPeriod = DatePeriod & { offerId: string };

/**
 * How close an objection is to a sale, nearest first.
 *
 * When every vendor says no they rarely say no for the same reason, and the useful thing to
 * show is the one that got furthest: "this boat turns around on Saturdays" is something the
 * visitor can act on, "we do not sell that season" is not, and reporting the second when the
 * first was also true sends them away from a booking they could have made.
 *
 * `invalid-range` is not in the list because it is a statement about the request rather than
 * about any offer, and every offer returns it together.
 *
 * The first four are `VIOLATION_PRIORITY` from `availability-rules.ts`, in its order: a single
 * offer already ranks its own rule failures that way, and a different order here would make the
 * combined answer disagree with the one-vendor answer for no reason.
 */
const VERDICT_PRECEDENCE: readonly RangeVerdict[] = [
  "too-long",
  "too-short",
  "checkout-day",
  "checkin-day",
  "refused",
  "occupied",
  "season-closed",
];

/**
 * Whether any offer will sell this exact charter, and which.
 *
 * Ties go to the first offer in the order given, so the caller decides what "which" means —
 * the selection step orders by price, and the calendar only cares that one exists.
 *
 * A listing with no offers is not bookable, and `season-closed` is the honest reading: there
 * is nothing on sale for those dates. It is never "occupied", which would claim a booking
 * that does not exist.
 */
export function combinedRangeStatus(
  checkIn: string,
  checkOut: string,
  offers: readonly OfferConstraints[],
): CombinedVerdict {
  if (offers.length === 0) return { verdict: "season-closed", offerId: null };

  let closest: CombinedVerdict | null = null;

  for (const offer of offers) {
    const verdict = rangeStatus(checkIn, checkOut, offer);
    if (verdict === "bookable") return { verdict, offerId: offer.offerId };
    if (verdict === "invalid-range") return { verdict, offerId: null };

    if (closest === null || rank(verdict) < rank(closest.verdict)) {
      closest = { verdict, offerId: null };
    }
  }

  return closest ?? { verdict: "season-closed", offerId: null };
}

/** Whether a charter could start on this day with anybody. */
export function combinedCanCheckIn(day: string, offers: readonly OfferConstraints[]): boolean {
  return offers.some((offer) => canCheckIn(day, offer));
}

/**
 * How far ahead `firstCombinedCheckInDay` will look. Eighteen months, because a season that
 * opens next spring is a normal thing for a calendar to have to reach and the vendors publish
 * rates about a year out.
 *
 * Deliberately not `SEARCH_DAYS`, the 35-day window `firstBookablePeriod` walks: that one
 * answers "what should the card advertise", where a charter beyond next month is not the
 * listing's headline. A calendar is asked a different question — which month to open on — and
 * over a boat whose season starts in six weeks the 35-day answer is "nowhere", which is how
 * the grid came to open on a month with every cell greyed out.
 */
const CHECK_IN_HORIZON_DAYS = 550;

/**
 * The first day from `from` that any offer would let a charter begin on, or null within the
 * horizon.
 *
 * The same predicate the grid greys its cells with, so the month this names always holds a
 * clickable day.
 */
export function firstCombinedCheckInDay(
  from: string,
  offers: readonly OfferConstraints[],
): string | null {
  for (let offset = 0; offset <= CHECK_IN_HORIZON_DAYS; offset++) {
    const day = addDays(from, offset);
    if (combinedCanCheckIn(day, offers)) return day;
  }
  return null;
}

/**
 * Every check-out day any offer would accept for this check-in, earliest first.
 *
 * A union rather than an intersection: a day one vendor will not close on is still a day the
 * charter can end, through the other. Dates are ISO, so lexicographic order is date order.
 */
export function combinedLegalCheckOuts(
  checkIn: string,
  offers: readonly OfferConstraints[],
): string[] {
  const days = new Set<string>();
  for (const offer of offers) {
    for (const day of legalCheckOuts(checkIn, offer)) days.add(day);
  }
  return [...days].sort();
}

/**
 * The check-out the card should offer beside this check-in: the earliest any vendor will
 * sell, which is the shortest charter on the shelf rather than the cheapest.
 *
 * Price does not decide it, because this runs before anybody has been asked for one. The
 * quote settles which vendor actually sells the range the visitor lands on.
 */
export function combinedOfferedCheckOut(
  checkIn: string,
  offers: readonly OfferConstraints[],
): string | null {
  let earliest: string | null = null;
  for (const offer of offers) {
    const day = offeredCheckOut(checkIn, offer);
    if (day !== null && (earliest === null || day < earliest)) earliest = day;
  }
  return earliest;
}

/**
 * What to tell a visitor about a day the calendar has greyed out, or null to say nothing.
 *
 * Only two of the vendors' three reasons are the visitor's business. `booked` and `held` are
 * facts about the boat that explain the gap and hint at whether it may reopen; `blocked` covers
 * service weeks, owner weeks and regattas, which are the operator's own arrangements and are
 * shown as plain unavailability rather than named.
 *
 * The cross-offer rule is the same one the rest of this module follows and it is easy to get
 * backwards: a day one vendor has sold is not a gap at all while another is free, so a day is
 * only labelled once every offer covering it is unavailable. A single `blocked` among them
 * silences the label rather than being outvoted, because the honest answer about that day is
 * one we do not disclose.
 */
export function occupancyStatusOn(
  day: string,
  offers: readonly OfferConstraints[],
): "held" | "booked" | null {
  if (offers.length === 0) return null;

  const covering: OccupiedPeriod[] = [];

  for (const offer of offers) {
    const period = offer.occupied.find((entry) => covers(entry, day));
    /*
     * This vendor's calendar has the day free, so whatever else greys it out is a rule -- a
     * turnaround weekday, a closed season, a minimum length -- and none of those is a fact
     * about the boat worth a badge. Read from the calendars alone rather than from
     * `canCheckIn`, which is false on every midweek day of a Saturday-to-Saturday fleet and
     * would have left the label on turnaround days only.
     */
    if (!period) return null;
    covering.push(period);
  }

  if (covering.some((period) => period.status === "blocked")) return null;
  if (covering.some((period) => period.status === "occupied")) return "booked";
  return covering.every((period) => period.status === "option") ? "held" : null;
}

/** Whether any offer would close a charter that began on `checkIn` on this day. */
export function combinedCanCheckOut(
  day: string,
  checkIn: string,
  offers: readonly OfferConstraints[],
): boolean {
  return combinedRangeStatus(checkIn, day, offers).verdict === "bookable";
}

/** The earliest charter anybody will sell from `from` onwards, and who would sell it. */
export function combinedFirstBookablePeriod(
  from: string,
  offers: readonly OfferConstraints[],
): CombinedPeriod | null {
  let best: CombinedPeriod | null = null;

  for (const offer of offers) {
    const period = firstBookablePeriod(from, offer);
    if (period === null) continue;
    if (best === null || period.startDate < best.startDate) {
      best = { ...period, offerId: offer.offerId };
      continue;
    }
    /* Same start day: the shorter charter is the one a card should name. */
    if (period.startDate === best.startDate && period.endDate < best.endDate) {
      best = { ...period, offerId: offer.offerId };
    }
  }

  return best;
}

function rank(verdict: RangeVerdict): number {
  const index = VERDICT_PRECEDENCE.indexOf(verdict);
  return index === -1 ? VERDICT_PRECEDENCE.length : index;
}
