import { ORPCError } from "@orpc/server";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderQuote, QuoteRequest } from "@yacht-charter/providers";
import { eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";

type Db = Database;

export type PersistedQuote = ProviderQuote & { quoteId: string };

/**
 * Prices a trip live and freezes the result. The provider is the authority on the
 * numbers; our row is the immutable record of what the customer was shown, which
 * checkout re-validates against before taking money (§6.1).
 */
export async function createQuote(
  db: Db,
  provider: InventoryProvider,
  input: QuoteRequest,
  userId: string | null,
): Promise<PersistedQuote> {
  const priced = await priceOrConflict(provider, input);
  const quoteId = await persist(db, priced, userId, input.extras ?? []);
  return { ...priced, quoteId };
}

/**
 * Re-prices an existing quote. The old row is marked `consumed` and points at its
 * replacement rather than being edited, so the chain of what was offered when stays
 * intact (§1.5 — immutable, supersede rather than mutate).
 */
export type RepriceChanges = {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  extras?: string[];
};

export async function repriceQuote(
  db: Db,
  provider: InventoryProvider,
  quoteId: string,
  userId: string | null,
  changes: RepriceChanges = {},
): Promise<PersistedQuote> {
  const existing = await readQuote(db, quoteId);

  // A quote belongs to whoever created it; an anonymous quote is claimable by the
  // first signed-in user to reprice it, which is how the sign-in-at-checkout flow
  // carries an anonymous price forward.
  if (existing.userId && userId && existing.userId !== userId) {
    throw new ORPCError("FORBIDDEN", { message: "Quote belongs to another user" });
  }

  // Anything the caller did not send keeps the previous quote's value, so the
  // sidebar can change one control at a time without restating the whole trip.
  const requestedExtras = changes.extras ?? existing.extras;
  const priced = await priceOrConflict(provider, {
    listingId: existing.listingId,
    checkIn: changes.checkIn ?? existing.checkIn,
    checkOut: changes.checkOut ?? existing.checkOut,
    guests: changes.guests ?? existing.guests,
    extras: requestedExtras,
    currency: existing.currency,
  });

  const replacementId = await db.transaction(async (tx) => {
    const newId = await persist(tx, priced, userId ?? existing.userId, requestedExtras);
    await tx
      .update(quote)
      .set({ status: "consumed", supersededByQuoteId: newId })
      .where(eq(quote.id, quoteId));
    return newId;
  });

  return {
    ...priced,
    quoteId: replacementId,
    // The caller asked to reprice, so the answer is a reprice regardless of whether
    // the provider's number happened to move.
    repriced: true,
  };
}

export async function readQuote(db: Db, quoteId: string) {
  const [row] = await db.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown quote" });
  return row;
}

/**
 * Guards every state-advancing call: an expired quote or a moved provider price must
 * not pass silently (§6.2). Returns the row when it is still good to act on.
 */
export async function assertQuoteIsFresh(db: Db, quoteId: string, now = new Date()) {
  const row = await readQuote(db, quoteId);

  if (row.status === "consumed") {
    throw new ORPCError("CONFLICT", { message: "Quote has already been used" });
  }

  if (row.status === "expired" || row.expiresAt <= now) {
    if (row.status !== "expired") {
      await db.update(quote).set({ status: "expired" }).where(eq(quote.id, quoteId));
    }
    throw new ORPCError("CONFLICT", {
      message: "Quote has expired — reprice before continuing",
      data: { code: "QUOTE_EXPIRED", quoteId },
    });
  }

  return row;
}

async function priceOrConflict(
  provider: InventoryProvider,
  input: QuoteRequest,
): Promise<ProviderQuote> {
  try {
    return await provider.getQuote(input);
  } catch (error) {
    if (error instanceof Error && error.message === "Requested slot is not available") {
      throw new ORPCError("CONFLICT", { message: "Requested slot is not available" });
    }
    throw error;
  }
}

async function persist(
  db: DatabaseExecutor,
  priced: ProviderQuote,
  userId: string | null,
  extras: string[],
): Promise<string> {
  const [row] = await db
    .insert(quote)
    .values({
      listingId: priced.listingId,
      userId,
      provider: priced.provider,
      providerSourceId: priced.providerSourceId,
      providerQuoteId: priced.id,
      checkIn: priced.checkIn,
      checkOut: priced.checkOut,
      guests: priced.guests,
      extras,
      currency: priced.currency,
      lines: priced.lines.map((line) => ({
        code: line.code,
        label: line.label,
        amountMinor: line.amount.amountMinor,
        currency: line.amount.currency,
        payWhen: line.payWhen,
      })),
      totalMinor: priced.total.amountMinor,
      depositMinor: priced.deposit.amountMinor,
      securityDepositMinor: priced.securityDeposit?.amountMinor ?? null,
      paymentPolicy: {
        mode: priced.paymentPolicy.mode,
        depositPct: priced.paymentPolicy.depositPct,
        balanceDueAt: priced.paymentPolicy.balanceDueAt,
        currency: priced.currency,
      },
      priceSourceHash: priced.priceSourceHash,
      expiresAt: new Date(priced.expiresAt),
    })
    .returning({ id: quote.id });

  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not persist quote" });
  return row.id;
}
