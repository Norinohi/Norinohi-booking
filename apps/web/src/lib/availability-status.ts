import type { useTranslations } from "next-intl";

/**
 * What a listing's availability says to a customer, in the three states a card can honestly claim.
 *
 * The vendors publish more than three — NauSYS and Booking Manager between them distinguish a
 * reservation from an option, an owner's week, a regatta, a delivery block and a service period —
 * and `availability_slot.status` keeps every one of them. None of that belongs on a card: the
 * customer is choosing a boat, not auditing why a week is gone, so every reason a week cannot be
 * sold collapses into `unavailable`.
 *
 * Two of the five labels the product names are deliberately *not* here, because neither is a fact
 * about a boat:
 *
 * - **Booked** is a fact about a date. The only listing-wide signal we hold is whether any date is
 *   free, and a hull with one booked week and fifty free ones is not "booked". The booking
 *   calendar is where a day says so.
 * - **Temporarily held** is a fact about a date too. `has_temporary_booking` is true when *any*
 *   slot of any offer is on option — 3,406 of the 18,655 listings in the local sync carry it while
 *   still holding a confirmed price for the charter their card advertises. Labelling those held
 *   would warn about a week the visitor is not looking at.
 *
 * A provider we could not reach is not in this list either. That is the state of our request
 * rather than of the yacht, and the booking sidebar reports it separately — conflating the two
 * would tell the visitor a boat needs confirming when in truth an API was down.
 */
export type AvailabilityStatus = "available" | "onRequest" | "unavailable";

export type AvailabilityFacts = {
  /** Any free dates at all, from the union of every offer's calendar. */
  hasAvailableDates: boolean;
  /** A charter we can name: the searched period, or the first one this boat would sell. */
  hasBookablePeriod: boolean;
};

/*
 * Only facts about the calendar decide this, which is what the three states above already claim
 * to be about.
 *
 * `priceIsFrom` used to force `onRequest` as well, and that is a fact about the price rather than
 * about the boat: 802 listings hold a legal sellable charter and a season floor to advertise it
 * with, and were labelled as though nothing could be sold. It also said the same thing twice --
 * the caption directly above the figure already reads "Charter price - seasonal minimum" -- and
 * once the projection started advertising those charters the chip contradicted the dates printed
 * beside it, and the live quote the detail sidebar fetches for them.
 *
 * So the price caveat stays with the price, and this answers the question it is asked: can this
 * boat be chartered.
 */
export function availabilityStatus(facts: AvailabilityFacts): AvailabilityStatus {
  if (!facts.hasAvailableDates) return "unavailable";
  if (!facts.hasBookablePeriod) return "onRequest";
  return "available";
}

/** Chip colours: green for a boat that can be booked now, amber for a caveat, grey for a no. */
export const AVAILABILITY_TONE = {
  available: "success",
  onRequest: "warning",
  unavailable: "neutral",
} as const satisfies Record<AvailabilityStatus, "success" | "warning" | "neutral">;

type BadgeTranslator = ReturnType<typeof useTranslations<"Common.boatCard.badges">>;

export function availabilityLabel(t: BadgeTranslator, status: AvailabilityStatus): string {
  return t(status);
}
