/*
 * Asks every vendor that could sell this charter, and picks the one the customer is shown.
 *
 * The orchestration around `offer-choice.ts`, which holds the rule itself. Kept apart from it
 * so the decision has no database and no network in it and can be tested against the cases
 * that actually happen: one vendor down, two currencies, everybody sold out.
 *
 * This replaces choosing an adapter from the listing before any dates were known. That could
 * only ever name whichever provider a preference list favoured, so on a hull both vendors sell
 * the second one's price and calendar were never consulted at all.
 */
import { listAvailabilityConstraints } from "@yacht-charter/db/search";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { sellableOffer } from "@yacht-charter/db/sellable-offer";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { listingRefusedPeriod } from "@yacht-charter/db/schema/availability";
import { providerCommission } from "@yacht-charter/db/schema/commission";
import { quoteOfferAttempt } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderQuote, QuoteRequest } from "@yacht-charter/providers";
import { NotFoundError, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";
import { and, eq } from "drizzle-orm";

import { env } from "@yacht-charter/env/server";

import type { Database, DatabaseExecutor } from "../context";
import { rangeStatus } from "../lib/availability-rules";
import { type CommissionRule, resolveCommissionRate } from "./commission";
import { getMarketplaceSettings } from "./marketplace-settings";
import { reliabilityByProvider } from "./provider-reliability";
import { type OfferQuoteResult, pickWinner } from "./offer-choice";
import { providerByKey } from "./provider-routing";

/**
 * How long one vendor is waited on before the sale goes to whoever else answered.
 *
 * A ceiling on the customer's wait rather than a cancellation: the adapters take no abort
 * signal, so the request runs on and its answer is simply no longer wanted. Threading
 * cancellation through every connector would be the better shape and is not what this change
 * is for.
 *
 * It was six seconds, which reads generous beside a vendor answering in 1.4s median and 2.4s
 * at its slowest -- and was not, because the ceiling has to cover our own load as well as
 * theirs. Six quotes were abandoned during a catalogue sync writing 309,222 price rows through
 * the same Postgres the quote path reads, on boats that were free and priced. Configurable
 * because the right number is a property of the deployment, not of the code.
 */
const OFFER_TIMEOUT_MS = env.QUOTE_OFFER_TIMEOUT_MS;

export type SelectedOffer = {
  /** Null only where a listing has no offers at all, which is a seeded or demo row. */
  listingOfferId: string | null;
  provider: InventoryProvider;
  priced: ProviderQuote;
};

export type OfferSelection = {
  selected: SelectedOffer;
  /** Every vendor asked and what it said, for `quote_offer_attempt`. */
  attempts: readonly OfferAttempt[];
  /** Two vendors priced in different currencies, so "cheaper" was not fully answerable. */
  currencyMismatch: boolean;
};

export type OfferAttempt = OfferQuoteResult & { latencyMs: number | null };

type OfferRow = {
  offerId: string;
  providerCode: string;
  currency: string | null;
  /** Whose fleet this offer sells, where the vendor named one. Commission is negotiated on it. */
  operatorId: string | null;
  /* Carried only so a persisted refusal can name the source row the sweep would have named. */
  listingSourceId: string | null;
};

/**
 * The best offer for this exact charter.
 *
 * Availability first: an offer whose own calendar and rules already refuse the range is never
 * put to its vendor, which is what stops quoting doubling both providers' call volume. Then
 * the cheapest all-in of whoever answered, with Booking Manager taking a tie.
 *
 * Raises only when nothing at all can be sold. A vendor that errored or timed out costs itself
 * the sale rather than costing the customer the boat, so a bad night at one provider degrades
 * to a single-offer marketplace instead of an outage.
 */
export async function selectBestOffer(
  db: Database,
  fallback: InventoryProvider,
  input: QuoteRequest,
): Promise<OfferSelection> {
  const offers = await listOffersForListing(db, input.listingId);

  /*
   * An empty list has two meanings and they need opposite answers, so the withheld case is
   * asked about separately. A listing whose offers all exist but none may be sold -- a retired
   * hull, or one the vendor vets by hand -- must not fall through to the configured adapter,
   * which would quote it happily and then be refused at the hold.
   */
  if (offers.length === 0 && (await hasWithheldOffer(db, input.listingId))) {
    throw new NoSellableOfferError("This boat is not available to book online", []);
  }

  /*
   * No offer at all means a listing no sync produced — a seeded demo row, or one whose sources
   * have all been retired. The configured adapter is the right answer for the first and
   * refusing would break it; the second fails at the adapter, which names the real fault.
   */
  if (offers.length === 0) {
    return {
      selected: {
        listingOfferId: null,
        provider: fallback,
        priced: await fallback.getQuote(input),
      },
      attempts: [],
      currencyMismatch: false,
    };
  }

  const eligible = await filterEligible(db, offers, input);
  /*
   * Read once for the whole selection rather than per offer: it is one small table, and the
   * rate that applies is a question about the charter's own dates, which do not change between
   * the offers being compared.
   */
  const commissionRules = await listCommissionRules(db, eligible);

  const { transactingPreference, offerRankingUsesBasePrice, offerRankingUsesReliability } =
    await getMarketplaceSettings(db);

  /* Read only when the step is switched on, so an aggregate over every quote of the last month
     is not run on a marketplace that has not asked for it. */
  const reliability = offerRankingUsesReliability ? await cachedReliability(db) : null;

  const results = await Promise.all(
    eligible.map((offer) =>
      askOffer(
        fallback,
        offer,
        input,
        resolveCommissionRate(commissionRules, {
          providerCode: offer.providerCode,
          operatorId: offer.operatorId,
          on: input.checkIn,
        }),
        reliability?.get(offer.providerCode) ?? null,
      ),
    ),
  );

  const attempts: OfferAttempt[] = [
    ...results.map((result) => result.attempt),
    ...ineligibleAttempts(offers, eligible),
  ];

  const { winner, currencyMismatch } = pickWinner(
    results.map((result): OfferQuoteResult => result.attempt),
    {
      preferredCurrency: offers[0]?.currency ?? null,
      preference: transactingPreference,
      rankOn: offerRankingUsesBasePrice ? "base" : "all_in",
      useReliability: offerRankingUsesReliability,
    },
  );

  if (!winner) {
    /* Reuse the path a single vendor's refusal already takes, so the caller sees one shape. */
    throw new NoSellableOfferError("No provider will sell this period", attempts, {
      providerCode: offers[0]?.providerCode,
    });
  }

  const won = results.find((result) => result.attempt.offerId === winner.offerId);
  if (!won?.priced) throw new NoSellableOfferError("No provider will sell this period", attempts);

  return {
    selected: {
      listingOfferId: winner.offerId,
      provider: won.provider,
      priced: won.priced,
    },
    attempts,
    currencyMismatch,
  };
}

/**
 * Every active rate that could apply to the vendors being asked, flattened for the resolver.
 *
 * Loaded whole rather than filtered per offer: the table holds one row per negotiated
 * agreement, and narrowing it in SQL would cost a query per vendor to save reading a handful
 * of rows. An empty table -- how this ships -- makes the resolver answer zero for everyone,
 * which is the commission step switched off.
 */
/**
 * The answer rates, kept for a few minutes.
 *
 * Unlike the settings row beside it, this is a window aggregate over every quote attempt of the
 * last month, and running it per quote would put a scan in front of a visitor waiting on a
 * price. Five minutes is far shorter than the window it summarises, so nothing here can be
 * wrong for long -- a vendor that starts failing is ranked down within the same session, and
 * the sale it wins meanwhile is one it was measured as able to serve.
 *
 * Per process rather than per deployment, and deliberately not invalidated when the setting
 * changes: switching the step on reads it fresh on the next quote either way.
 */
const RELIABILITY_TTL_MS = 5 * 60 * 1000;

let reliabilityCache: { at: number; rates: Map<string, number> } | null = null;

async function cachedReliability(db: Database): Promise<Map<string, number>> {
  const now = Date.now();
  if (reliabilityCache && now - reliabilityCache.at < RELIABILITY_TTL_MS) {
    return reliabilityCache.rates;
  }

  const { reliabilityWindowDays } = await getMarketplaceSettings(db);
  const rates = await reliabilityByProvider(db, reliabilityWindowDays);
  reliabilityCache = { at: now, rates };
  return rates;
}

async function listCommissionRules(
  db: Database,
  offers: readonly OfferRow[],
): Promise<CommissionRule[]> {
  if (offers.length < 2) return [];

  const rows = await db
    .select({
      id: providerCommission.id,
      providerCode: providerTable.code,
      operatorId: providerCommission.operatorId,
      ratePct: providerCommission.ratePct,
      startsAt: providerCommission.startsAt,
      endsAt: providerCommission.endsAt,
      active: providerCommission.active,
    })
    .from(providerCommission)
    .innerJoin(providerTable, eq(providerTable.id, providerCommission.providerId))
    .where(eq(providerCommission.active, true));

  return rows.map((row) => ({ ...row, ratePct: Number(row.ratePct) }));
}

/**
 * Whether this listing has offers and every one of them is withheld.
 *
 * Only asked when the sellable list came back empty, which is rare, so it costs a query on the
 * path that is about to refuse rather than on every quote.
 */
async function hasWithheldOffer(db: Database, listingId: string): Promise<boolean> {
  const [row] = await db
    .select({ offerId: listingOffer.id })
    .from(listingOffer)
    .where(and(eq(listingOffer.listingId, listingId), eq(listingOffer.status, "active")))
    .limit(1);

  return Boolean(row);
}

/**
 * Every offer this listing may be sold through.
 *
 * `sellableOffer` is the same predicate the search document is built on, imported rather than
 * restated: it lived only in the read model, so a retired hull or one the vendor vets by hand
 * was absent from search and still quotable from its own page. The refusal then arrived from
 * the provider at the end of checkout, which is the worst place to learn it.
 */
async function listOffersForListing(db: Database, listingId: string): Promise<OfferRow[]> {
  return db
    .select({
      offerId: listingOffer.id,
      providerCode: providerTable.code,
      currency: listingOffer.defaultCurrency,
      operatorId: listingOffer.operatorId,
      listingSourceId: listingOffer.listingSourceId,
    })
    .from(listingOffer)
    .innerJoin(providerTable, eq(providerTable.id, listingOffer.providerId))
    .where(
      and(
        eq(listingOffer.listingId, listingId),
        eq(listingOffer.status, "active"),
        sellableOffer({
          outOfFleetDate: listingOffer.outOfFleetDate,
          optionApprovalRequired: listingOffer.optionApprovalRequired,
          fixedBookingSupported: listingOffer.fixedBookingSupported,
        }),
      ),
    )
    .orderBy(listingOffer.id);
}

/**
 * The offers whose own published constraints admit this range.
 *
 * Read from what each vendor already told us rather than by asking it again: the sync writes
 * a calendar, a rate list and a set of rules per offer, and an offer that fails those will
 * fail the live call too. Where the read itself fails the offer is kept, because a stale cache
 * is a worse reason to lose a sale than a vendor saying no.
 */
async function filterEligible(
  db: Database,
  offers: readonly OfferRow[],
  input: QuoteRequest,
): Promise<OfferRow[]> {
  if (offers.length < 2) return [...offers];

  const constraints = await listAvailabilityConstraints(db, {
    listingId: input.listingId,
    from: input.checkIn,
    to: input.checkOut,
  });

  const byOffer = new Map(constraints.offers.map((offer) => [offer.offerId, offer]));
  return offers.filter((offer) => {
    const published = byOffer.get(offer.offerId);
    if (!published) return true;
    return rangeStatus(input.checkIn, input.checkOut, published) === "bookable";
  });
}

async function askOffer(
  fallback: InventoryProvider,
  offer: OfferRow,
  input: QuoteRequest,
  commissionPct: number,
  reliability: number | null,
): Promise<{ attempt: OfferAttempt; provider: InventoryProvider; priced: ProviderQuote | null }> {
  const started = Date.now();
  const provider = await providerByKey(fallback, offer.providerCode);

  try {
    const priced = await withTimeout(provider.getQuote(input));
    /*
     * Compared on the vendor's own total, which is everything the customer must pay to sail:
     * the rate, the obligatory fees, and the ones settled with the base on arrival. A rate
     * alone reverses the order whenever one vendor's mandatory fee is heavier, and taking the
     * quote's own figure is what keeps the comparison identical to the number we then show.
     */
    const baseMinor = baseLineOf(priced);

    return {
      provider,
      priced,
      attempt: {
        outcome: "priced",
        offerId: offer.offerId,
        providerCode: offer.providerCode,
        totalMinor: priced.total.amountMinor,
        baseMinor,
        /* Derived rather than summed from the mandatory lines, so the two halves always add
           back to the total the customer is shown. `group` is optional on a line, and a
           vendor that omits it would otherwise leave part of the bill in neither half. */
        obligatoryMinor: priced.total.amountMinor - baseMinor,
        currency: priced.currency,
        commissionPct,
        reliability,
        latencyMs: Date.now() - started,
      },
    };
  } catch (error) {
    /*
     * Classified here rather than in a helper: a caught value is `unknown` by design, and the
     * only honest thing to do with it is narrow it where it was caught.
     */
    const shared = { offerId: offer.offerId, providerCode: offer.providerCode };
    const failure: OfferQuoteResult =
      error instanceof SlotUnavailableError || error instanceof NotFoundError
        ? { ...shared, outcome: "unavailable", reason: error.name }
        : error instanceof TimeoutError
          ? { ...shared, outcome: "timeout", reason: "timeout" }
          : {
              ...shared,
              outcome: "error",
              reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
            };

    return { provider, priced: null, attempt: { ...failure, latencyMs: Date.now() - started } };
  }
}

/**
 * The charter rate out of a vendor's quote.
 *
 * The contract says an adapter marks exactly one line `base`, and every connector does. A
 * quote without one still has to be sellable, so it falls back to the whole total: the rate
 * then equals the all-in figure, both price comparators agree, and the offer is ranked the way
 * it was before the two were told apart. Losing a sale over a missing label would be a worse
 * answer than ranking it as we always did.
 */
function baseLineOf(priced: ProviderQuote): number {
  const base = priced.lines.find((line) => line.kind === "base");
  return base ? base.amount.amountMinor : priced.total.amountMinor;
}

function ineligibleAttempts(
  offers: readonly OfferRow[],
  eligible: readonly OfferRow[],
): OfferAttempt[] {
  const asked = new Set(eligible.map((offer) => offer.offerId));
  return offers
    .filter((offer) => !asked.has(offer.offerId))
    .map((offer) => ({
      outcome: "ineligible" as const,
      offerId: offer.offerId,
      providerCode: offer.providerCode,
      reason: "published constraints refuse the range",
      latencyMs: null,
    }));
}

/**
 * Nothing could be sold, carrying who was asked and what they said.
 *
 * A subclass rather than a new shape, so every `instanceof SlotUnavailableError` on the way
 * out still matches and the caller keeps seeing one CONFLICT. The attempts ride along because
 * this is the only place that knows them and the throw is where they were being dropped: the
 * audit `recordOfferAttempts` promises on a total failure never reached the table, and a
 * vendor's refusal — the one fact here that is about the boat rather than about our cache —
 * was learned and discarded on every request.
 */
export class NoSellableOfferError extends SlotUnavailableError {
  constructor(
    message: string,
    readonly attempts: readonly OfferAttempt[],
    options?: ConstructorParameters<typeof SlotUnavailableError>[1],
  ) {
    super(message, options);
  }
}

class TimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), OFFER_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/**
 * Writes down the periods a vendor turned down when it was actually asked.
 *
 * This is the only place the marketplace ever hears the vendor's own offers engine say no
 * about an exact charter. Its occupancy dump — which is all the sync reads, and all the card
 * and the calendar are built from — says only what is *booked*, and a boat can be unbooked
 * and still unsellable: at the wrong base, or with no room for a turnaround. The two
 * disagree on 250 to 400 boats a week (see `listing_refused_period`), and until now the
 * disagreement was resolved once per visitor, in their browser, and thrown away with the tab.
 *
 * The refusal sweep exists to close that gap but cannot reach every listing: it asks in whole
 * Saturday-to-Saturday weeks over a short horizon, and a fleet selling four-night midweek
 * charters further out is never asked about. A live quote is asked about exactly the charter
 * someone wants, which is why this catches what the sweep structurally cannot.
 *
 * Only `unavailable` is written. `ineligible` is our own cache refusing before the vendor was
 * reached, so recording it would just tell us what we already believed; `error` and `timeout`
 * said nothing at all, and a vendor having a bad night must never look like a boat that is gone.
 *
 * Guarded on our own published constraints, which is what makes a public endpoint safe to
 * learn from. Refusals are matched by containment, so a row for some short period inside a
 * real charter suppresses that charter — without this guard anyone could post a couple of
 * dates and empty a listing's calendar. After it, the only rows that can be written are ones
 * where our data said yes and the vendor said no, which is exactly the disagreement worth
 * keeping and is the vendor's call to make, not the caller's.
 */
export async function recordLiveRefusals(
  db: Database,
  input: {
    listingId: string;
    checkIn: string;
    checkOut: string;
    attempts: readonly OfferAttempt[];
  },
): Promise<number> {
  const refused = input.attempts.filter((attempt) => attempt.outcome === "unavailable");
  if (refused.length === 0) return 0;

  const constraints = await listAvailabilityConstraints(db, {
    listingId: input.listingId,
    from: input.checkIn,
    to: input.checkOut,
  });
  const byOffer = new Map(constraints.offers.map((offer) => [offer.offerId, offer]));

  const offers = await listOffersForListing(db, input.listingId);
  const sourceOf = new Map(offers.map((offer) => [offer.offerId, offer.listingSourceId]));

  const rows = refused
    .filter((attempt) => {
      const published = byOffer.get(attempt.offerId);
      /* No published constraints for the offer means nothing to contradict, so nothing learned. */
      if (!published) return false;
      return rangeStatus(input.checkIn, input.checkOut, published) === "bookable";
    })
    .map((attempt) => ({
      listingId: input.listingId,
      listingSourceId: sourceOf.get(attempt.offerId) ?? null,
      listingOfferId: attempt.offerId,
      startDate: input.checkIn,
      endDate: input.checkOut,
    }));

  if (rows.length === 0) return 0;

  /*
   * The same period from the next visitor is the same fact, not a new one -- but it is a
   * fresher telling of it, and freshness is what keeps the row trusted: readers ignore a
   * refusal nothing has re-confirmed within REFUSAL_TRUST_DAYS. A vendor that keeps saying no
   * keeps the dates hidden; one that quietly reopens them stops renewing the row and the
   * charter comes back on its own.
   */
  await db
    .insert(listingRefusedPeriod)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        listingRefusedPeriod.listingOfferId,
        listingRefusedPeriod.startDate,
        listingRefusedPeriod.endDate,
      ],
      set: { updatedAt: new Date() },
    });
  return rows.length;
}

/**
 * Records who was asked and what they said.
 *
 * Without it, "we showed the cheaper price" is a claim nobody can check after the fact, and a
 * marketplace quietly falling back to one vendor every night looks exactly like one genuinely
 * quoting two. Written after the quote so the winning row can name it, and on a total failure
 * with no quote at all, which is the case most worth being able to count.
 */
export async function recordOfferAttempts(
  db: DatabaseExecutor,
  input: {
    quoteId: string | null;
    listingId: string;
    checkIn: string;
    checkOut: string;
    attempts: readonly OfferAttempt[];
    winningOfferId: string | null;
  },
): Promise<void> {
  if (input.attempts.length === 0) return;

  const rows: (typeof quoteOfferAttempt.$inferInsert)[] = input.attempts.map((attempt) => ({
    quoteId: input.quoteId,
    listingId: input.listingId,
    listingOfferId: attempt.offerId,
    provider: attempt.providerCode,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    outcome:
      attempt.outcome === "priced"
        ? attempt.offerId === input.winningOfferId
          ? ("won" as const)
          : ("lost" as const)
        : attempt.outcome,
    totalMinor: attempt.outcome === "priced" ? attempt.totalMinor : null,
    baseMinor: attempt.outcome === "priced" ? attempt.baseMinor : null,
    obligatoryExtrasMinor: attempt.outcome === "priced" ? attempt.obligatoryMinor : null,
    commissionPct: attempt.outcome === "priced" ? attempt.commissionPct.toFixed(4) : null,
    currency: attempt.outcome === "priced" ? attempt.currency : null,
    latencyMs: attempt.latencyMs,
    reason: attempt.outcome === "priced" ? null : attempt.reason,
  }));

  await db.insert(quoteOfferAttempt).values(rows);
}
