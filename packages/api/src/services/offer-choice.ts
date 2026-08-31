/*
 * Which of a listing's offers the customer is shown and sold.
 *
 * The rule the client settled on: among the offers that can actually deliver the requested
 * dates, the cheapest all-in total, with Booking Manager taking a tie. Availability comes
 * first because a lower price on a boat that cannot be delivered is not a lower price.
 *
 * Kept apart from the orchestration that quotes the vendors so the decision itself has no
 * database and no network in it, and can be tested against the cases that actually happen:
 * one vendor down, two currencies, everybody sold out.
 */

/** Architecture §3, and the client's answer to §3.4 item 6: Booking Manager wins a tie. */
export const TRANSACTING_PREFERENCE = ["booking_manager", "nausys", "mock"] as const;

/**
 * What one offer answered.
 *
 * `ineligible` never reached the vendor: the offer's own calendar and rules already refused
 * the range. `unavailable` did reach it and was turned down. The two are separated because
 * only the second is evidence about the boat — the first is evidence about our cache.
 */
export type OfferQuoteResult =
  | {
      outcome: "priced";
      offerId: string;
      providerCode: string;
      /** Everything the customer must pay to sail: the rate plus the unavoidable extras. */
      totalMinor: number;
      currency: string;
    }
  | {
      outcome: "ineligible" | "unavailable" | "error" | "timeout";
      offerId: string;
      providerCode: string;
      reason: string;
    };

export type PricedOffer = Extract<OfferQuoteResult, { outcome: "priced" }>;

export type WinnerChoice = {
  winner: PricedOffer | null;
  /**
   * Two vendors priced the same charter in different currencies, so "cheaper" was not a
   * question this could answer on its own.
   *
   * Flagged rather than silently resolved because it is the case where the marketplace's
   * central promise quietly stops holding, and nobody would otherwise know how often it
   * happens. See `quote_offer_attempt` for the per-request record.
   */
  currencyMismatch: boolean;
};

export type PickWinnerOptions = {
  /**
   * The listing's own currency, used to break a mismatch: the offers quoting it are the ones
   * the card's price is comparable against.
   */
  preferredCurrency?: string | null;
  preference?: readonly string[];
};

/**
 * The offer to sell, out of everything that answered.
 *
 * Only a priced answer can win. An offer that errored or timed out is not treated as
 * expensive — it said nothing — so a vendor having a bad night costs it the sale rather than
 * costing the customer the boat.
 *
 * On a currency mismatch the comparison narrows to the listing's own currency where any
 * offer quotes it; where none does, price is abandoned rather than faked, and the preference
 * order decides. Converting at some rate of our own would put a number in front of the
 * customer that neither vendor agreed to.
 */
export function pickWinner(
  results: readonly OfferQuoteResult[],
  options: PickWinnerOptions = {},
): WinnerChoice {
  const preference = options.preference ?? TRANSACTING_PREFERENCE;
  const priced = results.filter((result): result is PricedOffer => result.outcome === "priced");
  if (priced.length === 0) return { winner: null, currencyMismatch: false };

  const currencies = new Set(priced.map((offer) => offer.currency));
  const currencyMismatch = currencies.size > 1;

  const comparable = currencyMismatch
    ? narrowToOneCurrency(priced, options.preferredCurrency)
    : priced;

  /* Price only orders offers quoted in the same money. Otherwise it is left out entirely. */
  const oneCurrency = new Set(comparable.map((offer) => offer.currency)).size === 1;

  const ranked = [...comparable].sort((left, right) => {
    if (oneCurrency && left.totalMinor !== right.totalMinor) {
      return left.totalMinor - right.totalMinor;
    }
    const byPreference = rank(left, preference) - rank(right, preference);
    if (byPreference !== 0) return byPreference;
    return left.offerId < right.offerId ? -1 : left.offerId > right.offerId ? 1 : 0;
  });

  return { winner: ranked[0] ?? null, currencyMismatch };
}

/**
 * The largest set of offers that can be compared on price: the ones quoting the listing's own
 * currency, or nothing at all when none of them do.
 */
function narrowToOneCurrency(
  priced: readonly PricedOffer[],
  preferredCurrency: string | null | undefined,
): PricedOffer[] {
  if (!preferredCurrency) return [...priced];
  const matching = priced.filter((offer) => offer.currency === preferredCurrency);
  return matching.length > 0 ? matching : [...priced];
}

function rank(offer: PricedOffer, preference: readonly string[]): number {
  const index = preference.indexOf(offer.providerCode);
  return index === -1 ? preference.length : index;
}
