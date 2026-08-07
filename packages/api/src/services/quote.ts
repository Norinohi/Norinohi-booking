import { ORPCError } from "@orpc/server";
import { listing } from "@yacht-charter/db/schema/listing";
import {
  priceAdjustmentSnapshot,
  quote,
  type QuoteLine,
  type QuotePaymentPolicy,
} from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderQuote, QuoteRequest } from "@yacht-charter/providers";
import { eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";
import { resolveDiscountForListing, type DiscountRejection } from "./discount";
import { spendableCreditMinor } from "./loyalty";
import {
  loadAdjustmentsForListings,
  payableNowMinor,
  resolveAdjustedPrice,
  resolvePaymentPolicy,
  totalMinor,
  type AppliedAdjustment,
} from "./pricing";
export type PersistedQuote = ProviderQuote & {
  quoteId: string;
  /** The promo code that was applied, or null. */
  discount: { code: string; name: string; amountMinor: number } | null;
  /** Set when a code was supplied but unusable; the quote is priced without it. */
  discountRejected: DiscountRejection | null;
  /** Referral credit absorbed by this quote, redeemed for real at checkout. */
  creditApplied: { amountMinor: number; currency: string } | null;
  adjustments: AppliedAdjustment[];
};

export type RepriceChanges = {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  extras?: string[];
  discountCode?: string | null;
  applyCredit?: boolean;
};

/**
 * Prices a trip live, runs it through the internal pipeline, and freezes the
 * result. The provider is the authority on its own numbers; everything after that
 * — internal rules, promo codes, how much is due up front — is ours, and the row
 * we write is what checkout re-validates against before taking money (§6.1).
 */
export async function createQuote(
  db: Database,
  provider: InventoryProvider,
  input: QuoteRequest & { discountCode?: string; applyCredit?: boolean },
  userId: string | null,
): Promise<PersistedQuote> {
  const priced = await priceOrConflict(provider, input);
  return persistPricedQuote(db, priced, {
    userId,
    extras: input.extras ?? [],
    discountCode: input.discountCode ?? null,
    applyCredit: input.applyCredit ?? false,
  });
}

/**
 * Re-prices an existing quote. The old row is marked `consumed` and points at its
 * replacement rather than being edited, so the chain of what was offered when stays
 * intact (§1.5 — immutable, supersede rather than mutate).
 */
export async function repriceQuote(
  db: Database,
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
  const discountCode =
    changes.discountCode === undefined ? existing.discountCode : changes.discountCode;

  const priced = await priceOrConflict(provider, {
    listingId: existing.listingId,
    checkIn: changes.checkIn ?? existing.checkIn,
    checkOut: changes.checkOut ?? existing.checkOut,
    guests: changes.guests ?? existing.guests,
    extras: requestedExtras,
    currency: existing.currency,
  });

  const replacement = await db.transaction(async (tx) => {
    const result = await persistPricedQuote(tx, priced, {
      userId: userId ?? existing.userId,
      extras: requestedExtras,
      discountCode,
      applyCredit: changes.applyCredit ?? existing.creditAppliedMinor > 0,
    });

    await tx
      .update(quote)
      .set({ status: "consumed", supersededByQuoteId: result.quoteId })
      .where(eq(quote.id, quoteId));

    return result;
  });

  // The caller asked to reprice, so the answer is a reprice regardless of whether
  // the provider's number happened to move.
  return { ...replacement, repriced: true };
}

export async function readQuote(db: Database, quoteId: string) {
  const [row] = await db.select().from(quote).where(eq(quote.id, quoteId)).limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown quote" });
  return row;
}

/**
 * Guards every state-advancing call: an expired quote or a moved provider price must
 * not pass silently (§6.2). Returns the row when it is still good to act on.
 */
export async function assertQuoteIsFresh(db: Database, quoteId: string, now = new Date()) {
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

/* ------------------------------------------------------------------ pipeline */

/**
 * provider price → internal rules → discount → payment policy.
 *
 * Rules move the charter base only: that is what Manage Prices edits, and
 * discounting a fee the base collects in cash on arrival would be meaningless.
 * The promo code then comes off everything payable up front.
 */
async function persistPricedQuote(
  db: DatabaseExecutor,
  priced: ProviderQuote,
  options: {
    userId: string | null;
    extras: string[];
    discountCode: string | null;
    applyCredit: boolean;
  },
): Promise<PersistedQuote> {
  const currency = priced.currency;
  const onDate = priced.checkIn;

  let lines: QuoteLine[] = priced.lines.map((line) => ({
    code: line.code,
    label: line.label,
    amountMinor: line.amount.amountMinor,
    currency: line.amount.currency,
    payWhen: line.payWhen,
    kind: line.kind,
  }));

  const applied: AppliedAdjustment[] = [];

  // 1. Internal price_adjustment_rule, against the charter base.
  const baseIndex = lines.findIndex((line) => line.kind === "base");
  const baseLine = baseIndex >= 0 ? lines[baseIndex] : undefined;
  if (baseLine) {
    const rules = (await loadAdjustmentsForListings(db, [priced.listingId], onDate)).get(
      priced.listingId,
    );

    if (rules && rules.length > 0) {
      const resolved = resolveAdjustedPrice(baseLine.amountMinor, rules);
      applied.push(...resolved.applied);
      lines[baseIndex] = { ...baseLine, amountMinor: resolved.amountMinor };
    }
  }

  // 2. Marketing discount, off everything payable now.
  let discountRejected: DiscountRejection | null = null;
  let appliedDiscount: PersistedQuote["discount"] = null;
  let discountId: string | null = null;

  if (options.discountCode) {
    const outcome = await resolveDiscountForListing(
      db,
      options.discountCode,
      priced.listingId,
      onDate,
    );

    if ("rejected" in outcome) {
      // Price without it rather than failing — a mistyped code should not cost the
      // visitor the whole quote.
      discountRejected = outcome.rejected;
    } else {
      const payable = payableNowMinor(lines);
      const off =
        outcome.discount.type === "percentage"
          ? Math.round(payable * ((outcome.discount.valuePct ?? 0) / 100))
          : Math.min(outcome.discount.valueMinor ?? 0, payable);

      if (off > 0) {
        lines = [
          ...lines,
          {
            code: outcome.discount.code,
            label: outcome.discount.name,
            amountMinor: -off,
            currency,
            payWhen: "now",
            kind: "discount",
          },
        ];

        applied.push({
          source: "discount",
          sourceId: outcome.discount.id,
          name: outcome.discount.name,
          type: outcome.discount.type,
          valuePct: outcome.discount.valuePct,
          valueMinor: outcome.discount.valueMinor,
          amountMinor: -off,
        });
      }

      discountId = outcome.discount.id;
      appliedDiscount = {
        code: outcome.discount.code,
        name: outcome.discount.name,
        amountMinor: off,
      };
    }
  }

  // 3. Referral credit, last: it is a way of paying rather than a price change,
  // so it comes off after everything that decides what the trip costs.
  let creditApplied: PersistedQuote["creditApplied"] = null;

  if (options.applyCredit) {
    const spendable = await spendableCreditMinor(
      db,
      options.userId,
      totalMinor(lines),
      payableNowMinor(lines),
    );

    if (spendable > 0) {
      lines = [
        ...lines,
        {
          code: "referral-credit",
          label: "Referral credit",
          amountMinor: -spendable,
          currency,
          payWhen: "now",
          kind: "credit",
        },
      ];
      creditApplied = { amountMinor: spendable, currency };
    }
  }

  // 4. Payment policy, then the deposit that follows from it.
  const [listingRow] = await db
    .select({ paymentPolicy: listing.paymentPolicy })
    .from(listing)
    .where(eq(listing.id, priced.listingId))
    .limit(1);

  const paymentPolicy = resolvePaymentPolicy(
    listingRow?.paymentPolicy ?? null,
    priced.paymentPolicy,
    currency,
  );

  const total = totalMinor(lines);
  const payable = payableNowMinor(lines);
  const depositMinor =
    paymentPolicy.mode === "full" ? payable : Math.round(payable * paymentPolicy.depositPct);

  const quoteId = await insertQuote(db, {
    priced,
    lines,
    total,
    depositMinor,
    paymentPolicy,
    userId: options.userId,
    extras: options.extras,
    discountId,
    discountCode: appliedDiscount?.code ?? null,
    creditAppliedMinor: creditApplied?.amountMinor ?? 0,
    applied,
  });

  return {
    ...priced,
    quoteId,
    lines: lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
      payWhen: line.payWhen,
      kind: line.kind,
    })),
    total: { amountMinor: total, currency },
    deposit: { amountMinor: depositMinor, currency },
    paymentPolicy: {
      mode: paymentPolicy.mode,
      depositPct: paymentPolicy.depositPct,
      balanceDueAt: paymentPolicy.balanceDueAt,
    },
    discount: appliedDiscount,
    discountRejected,
    creditApplied,
    adjustments: applied,
  };
}

async function insertQuote(
  db: DatabaseExecutor,
  input: {
    priced: ProviderQuote;
    lines: QuoteLine[];
    total: number;
    depositMinor: number;
    paymentPolicy: QuotePaymentPolicy;
    userId: string | null;
    extras: string[];
    discountId: string | null;
    discountCode: string | null;
    creditAppliedMinor: number;
    applied: AppliedAdjustment[];
  },
): Promise<string> {
  const [row] = await db
    .insert(quote)
    .values({
      listingId: input.priced.listingId,
      userId: input.userId,
      provider: input.priced.provider,
      providerSourceId: input.priced.providerSourceId,
      providerQuoteId: input.priced.id,
      checkIn: input.priced.checkIn,
      checkOut: input.priced.checkOut,
      guests: input.priced.guests,
      extras: input.extras,
      currency: input.priced.currency,
      lines: input.lines,
      totalMinor: input.total,
      depositMinor: input.depositMinor,
      securityDepositMinor: input.priced.securityDeposit?.amountMinor ?? null,
      paymentPolicy: input.paymentPolicy,
      discountId: input.discountId,
      discountCode: input.discountCode,
      creditAppliedMinor: input.creditAppliedMinor,
      priceSourceHash: input.priced.priceSourceHash,
      expiresAt: new Date(input.priced.expiresAt),
    })
    .returning({ id: quote.id });

  if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not persist quote" });

  if (input.applied.length > 0) {
    await db.insert(priceAdjustmentSnapshot).values(
      input.applied.map((adjustment, index) => ({
        quoteId: row.id,
        source: adjustment.source,
        sourceId: adjustment.sourceId,
        name: adjustment.name,
        type: adjustment.type,
        valuePct: adjustment.valuePct === null ? null : adjustment.valuePct.toFixed(4),
        valueMinor: adjustment.valueMinor,
        amountMinor: adjustment.amountMinor,
        currency: input.priced.currency,
        sortOrder: index,
      })),
    );
  }

  return row.id;
}
