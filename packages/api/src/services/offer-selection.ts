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
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { quoteOfferAttempt } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderQuote, QuoteRequest } from "@yacht-charter/providers";
import { NotFoundError, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";
import { and, eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";
import { rangeStatus } from "../lib/availability-rules";
import { type OfferQuoteResult, pickWinner } from "./offer-choice";
import { providerByKey } from "./provider-routing";

/**
 * How long one vendor is waited on before the sale goes to whoever else answered.
 *
 * A ceiling on the customer's wait rather than a cancellation: the adapters take no abort
 * signal, so the request runs on and its answer is simply no longer wanted. Threading
 * cancellation through every connector would be the better shape and is not what this change
 * is for.
 */
const OFFER_TIMEOUT_MS = 6_000;

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

type OfferRow = { offerId: string; providerCode: string; currency: string | null };

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
  const results = await Promise.all(eligible.map((offer) => askOffer(fallback, offer, input)));

  const attempts: OfferAttempt[] = [
    ...results.map((result) => result.attempt),
    ...ineligibleAttempts(offers, eligible),
  ];

  const { winner, currencyMismatch } = pickWinner(
    results.map((result): OfferQuoteResult => result.attempt),
    { preferredCurrency: offers[0]?.currency ?? null },
  );

  if (!winner) {
    /* Reuse the path a single vendor's refusal already takes, so the caller sees one shape. */
    throw new SlotUnavailableError("No provider will sell this period", {
      providerCode: offers[0]?.providerCode,
    });
  }

  const won = results.find((result) => result.attempt.offerId === winner.offerId);
  if (!won?.priced) throw new SlotUnavailableError("No provider will sell this period");

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

async function listOffersForListing(db: Database, listingId: string): Promise<OfferRow[]> {
  return db
    .select({
      offerId: listingOffer.id,
      providerCode: providerTable.code,
      currency: listingOffer.defaultCurrency,
    })
    .from(listingOffer)
    .innerJoin(providerTable, eq(providerTable.id, listingOffer.providerId))
    .where(and(eq(listingOffer.listingId, listingId), eq(listingOffer.status, "active")))
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
): Promise<{ attempt: OfferAttempt; provider: InventoryProvider; priced: ProviderQuote | null }> {
  const started = Date.now();
  const provider = await providerByKey(fallback, offer.providerCode);

  try {
    const priced = await withTimeout(provider.getQuote(input));
    return {
      provider,
      priced,
      attempt: {
        outcome: "priced",
        offerId: offer.offerId,
        providerCode: offer.providerCode,
        totalMinor: allInMinor(priced),
        currency: priced.currency,
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
 * What the customer must pay to sail, which is the only figure two vendors can be compared on.
 *
 * A rate alone is not it: the same hull is quoted 4,600 by one vendor and 5,000 by the other
 * with a mandatory fee that reverses the order. Lines payable at the marina are excluded for
 * the same reason the card excludes them — they are not part of what we take.
 */
function allInMinor(priced: ProviderQuote): number {
  return priced.lines
    .filter((line) => line.payWhen !== "at_check_in")
    .reduce((total, line) => total + line.amount.amountMinor, 0);
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

class TimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), OFFER_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
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
    currency: attempt.outcome === "priced" ? attempt.currency : null,
    latencyMs: attempt.latencyMs,
    reason: attempt.outcome === "priced" ? null : attempt.reason,
  }));

  await db.insert(quoteOfferAttempt).values(rows);
}
