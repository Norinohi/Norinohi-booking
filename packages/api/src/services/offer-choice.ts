/*
 * Which of a listing's offers the customer is shown and sold.
 *
 * The order the client settled on, most decisive first: can the vendor deliver these dates at
 * all, then price, then obligatory extras, then which vendor pays us more, then which one
 * answers more reliably, and only then a configured preference. Availability comes first
 * because a lower price on a boat that cannot be delivered is not a lower price.
 *
 * What "price" means is the one part that is switchable. The charter rate is the number a
 * visitor compares against other sites; the all-in total is the number they actually pay. The
 * client asked for the first and we shipped the second, so `rankOn` decides and the default
 * keeps today's behaviour. Ranking on the rate can pick the dearer charter: a vendor 100
 * cheaper on the rate and 250 heavier on mandatory fees wins, and that is the trade being
 * asked for rather than a bug in it.
 *
 * Kept apart from the orchestration that quotes the vendors so the decision itself has no
 * database and no network in it, and can be tested against the cases that actually happen:
 * one vendor down, two currencies, everybody sold out.
 */

/** Architecture §3, and the client's answer to §3.4 item 6: Booking Manager wins a tie. */
export const TRANSACTING_PREFERENCE = ["booking_manager", "nausys", "mock"] as const;

/**
 * Which figure price is compared on.
 *
 * `all_in` is what the marketplace has always done and stays the default: nothing changes for
 * anyone who does not ask for it. `base` is the client's agreed order, where the charter rate
 * decides and obligatory extras only settle a tie on it.
 */
export type PriceBasis = "all_in" | "base";

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
      /** The charter rate alone, as the vendor's own base line stated it. */
      baseMinor: number;
      /** What sits on top of the rate. Derived, so the two always add up to the total. */
      obligatoryMinor: number;
      currency: string;
      /** What we earn through this vendor on the day, as a percentage. Zero when unpriced. */
      commissionPct: number;
      /**
       * The vendor's recent answer rate, nought to one, or null where it is not measured yet.
       * Read only when the caller asks for it, so an unmeasured vendor is never ranked on noise.
       */
      reliability?: number | null;
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
  /** Defaults to `all_in`, which is what the marketplace did before the rate was an option. */
  rankOn?: PriceBasis;
  /** Off by default: reliability decides nothing until somebody has looked at the numbers. */
  useReliability?: boolean;
};

/**
 * The offer to sell, out of everything that answered.
 *
 * Only a priced answer can win. An offer that errored or timed out is not treated as
 * expensive — it said nothing — so a vendor having a bad night costs it the sale rather than
 * costing the customer the boat.
 *
 * On a currency mismatch the comparison narrows to the listing's own currency where any
 * offer quotes it; where none does, every money comparison is abandoned rather than faked and
 * the steps below money decide. Converting at some rate of our own would put a number in
 * front of the customer that neither vendor agreed to.
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

  /*
   * Price only orders offers quoted in the same money, and so does everything derived from it.
   * The gate covers every money comparator rather than just the first: a pair left in two
   * currencies would otherwise fall past the rate into the extras, which are just as
   * incomparable, and be settled on a number nobody can add up.
   */
  const oneCurrency = new Set(comparable.map((offer) => offer.currency)).size === 1;
  const comparators = comparatorsFor(options, oneCurrency, preference);

  const ranked = [...comparable].sort((left, right) => {
    for (const compare of comparators) {
      const verdict = compare(left, right);
      if (verdict !== 0) return verdict;
    }
    return 0;
  });

  return { winner: ranked[0] ?? null, currencyMismatch };
}

type Comparator = (left: PricedOffer, right: PricedOffer) => number;

/**
 * The agreed order, assembled for this particular call.
 *
 * Built rather than written out as one function so each step is separable: the money steps
 * drop out together when the currencies disagree, and reliability stays out until it is asked
 * for. The last two always run, which is what makes the result stable for identical requests.
 */
function comparatorsFor(
  options: PickWinnerOptions,
  oneCurrency: boolean,
  preference: readonly string[],
): Comparator[] {
  const comparators: Comparator[] = [];

  if (oneCurrency) {
    /* Rate first and extras as its tie-break, or the all-in total alone, which already
       contains both and cannot be separated back into them by a second step. */
    if (options.rankOn === "base") {
      comparators.push(
        (left, right) => left.baseMinor - right.baseMinor,
        (left, right) => left.obligatoryMinor - right.obligatoryMinor,
      );
    } else {
      comparators.push((left, right) => left.totalMinor - right.totalMinor);
    }

    /* Higher earns more, so it sorts first. Zero on both sides while the rates table is
       empty, which is that step switched off. */
    comparators.push((left, right) => right.commissionPct - left.commissionPct);
  }

  if (options.useReliability) {
    /* Skipped for a pair where either side is unmeasured: ranking a new connector against a
       measured one would read its silence as a failure. */
    comparators.push((left, right) => {
      if (left.reliability == null || right.reliability == null) return 0;
      return right.reliability - left.reliability;
    });
  }

  comparators.push(
    (left, right) => rank(left, preference) - rank(right, preference),
    (left, right) => (left.offerId < right.offerId ? -1 : left.offerId > right.offerId ? 1 : 0),
  );

  return comparators;
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
