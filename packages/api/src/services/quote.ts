import { ORPCError } from "@orpc/server";
import { listing } from "@yacht-charter/db/schema/listing";
import {
  priceAdjustmentSnapshot,
  quote,
  type QuoteLine,
  type QuotePaymentPolicy,
} from "@yacht-charter/db/schema/quote";
import { crewTypeSchema } from "@yacht-charter/providers";
import type {
  CrewType,
  InventoryProvider,
  ProviderQuote,
  QuoteRequest,
} from "@yacht-charter/providers";
import { NotFoundError, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";
import { eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";
import { resolveDiscountForListing, type DiscountRejection } from "./discount-redemption";
import { spendableCreditMinor, welcomeDiscountMinor } from "./loyalty";
import {
  buildPaymentSchedulePreview,
  loadAdjustmentsForListings,
  payableNowMinor,
  perPersonMinor,
  resolveAdjustedPrice,
  resolvePaymentPolicy,
  totalMinor,
  type AppliedAdjustment,
  type QuotePaymentScheduleEntry,
} from "./pricing";
export type PersistedQuote = ProviderQuote & {
  quoteId: string;
  /** The trip split across the party; null when the guest count is unusable. */
  perPerson: { amountMinor: number; currency: string } | null;
  /** Derived instalments, in the order the customer meets them. */
  paymentSchedule: {
    kind: QuotePaymentScheduleEntry["kind"];
    amount: { amountMinor: number; currency: string };
    dueAt: string | null;
  }[];
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
  crewType?: CrewType;
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
    crewType: input.crewType ?? null,
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
  const requestedCrewType = changes.crewType ?? asCrewType(existing.crewType);
  const discountCode =
    changes.discountCode === undefined ? existing.discountCode : changes.discountCode;

  const request: Parameters<typeof priceOrConflict>[1] = {
    listingId: existing.listingId,
    checkIn: changes.checkIn ?? existing.checkIn,
    checkOut: changes.checkOut ?? existing.checkOut,
    guests: changes.guests ?? existing.guests,
    extras: requestedExtras,
    currency: existing.currency,
  };

  if (requestedCrewType) request.crewType = requestedCrewType;

  const priced = await priceOrConflict(provider, request);

  const replacement = await db.transaction(async (tx) => {
    const result = await persistPricedQuote(tx, priced, {
      userId: userId ?? existing.userId,
      extras: requestedExtras,
      crewType: requestedCrewType ?? null,
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
    // Matched on the type, not the wording: a provider rephrasing its message must
    // not silently turn a sold-out week into a 500.
    if (error instanceof SlotUnavailableError || error instanceof NotFoundError) {
      throw new ORPCError("CONFLICT", { message: "Requested slot is not available" });
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ pipeline */

/* ------------------------------------------------------- pipeline stages (1-4) */

/**
 * Stage 1. Internal rules move the charter base only, so a quote with no base
 * line — or a listing no rule targets — passes through untouched.
 */
async function applyInternalRules(
  db: DatabaseExecutor,
  lines: QuoteLine[],
  listingId: string,
  onDate: string,
): Promise<{ lines: QuoteLine[]; applied: AppliedAdjustment[] }> {
  const baseIndex = lines.findIndex((line) => line.kind === "base");
  const baseLine = baseIndex >= 0 ? lines[baseIndex] : undefined;
  if (!baseLine) return { lines, applied: [] };

  const rules = (await loadAdjustmentsForListings(db, [listingId], onDate)).get(listingId);
  if (!rules || rules.length === 0) return { lines, applied: [] };

  const resolved = resolveAdjustedPrice(baseLine.amountMinor, rules);
  const next = [...lines];
  next[baseIndex] = { ...baseLine, amountMinor: resolved.amountMinor };

  return { lines: next, applied: resolved.applied };
}

/**
 * Stage 2. A rejected code prices the trip without it and reports why, rather
 * than failing: a mistyped code should not cost the visitor the whole quote.
 */
async function applyDiscountCode(
  db: DatabaseExecutor,
  lines: QuoteLine[],
  code: string,
  listingId: string,
  onDate: string,
  currency: string,
): Promise<{
  lines: QuoteLine[];
  applied: AppliedAdjustment[];
  discount: PersistedQuote["discount"];
  discountId: string | null;
  rejected: DiscountRejection | null;
}> {
  const outcome = await resolveDiscountForListing(db, code, listingId, onDate);

  if ("rejected" in outcome) {
    return { lines, applied: [], discount: null, discountId: null, rejected: outcome.rejected };
  }

  const payable = payableNowMinor(lines);
  const off =
    outcome.discount.type === "percentage"
      ? Math.round(payable * ((outcome.discount.valuePct ?? 0) / 100))
      : Math.min(outcome.discount.valueMinor ?? 0, payable);

  // Recorded even at zero: the code was valid and accepted, and the checkout
  // still redeems it against the booking.
  const discount = { code: outcome.discount.code, name: outcome.discount.name, amountMinor: off };
  const base = { discount, discountId: outcome.discount.id, rejected: null };

  if (off <= 0) return { lines, applied: [], ...base };

  return {
    lines: [
      ...lines,
      {
        code: outcome.discount.code,
        label: outcome.discount.name,
        amountMinor: -off,
        currency,
        payWhen: "now",
        kind: "discount",
      },
    ],
    applied: [
      {
        source: "discount",
        sourceId: outcome.discount.id,
        name: outcome.discount.name,
        type: outcome.discount.type,
        valuePct: outcome.discount.valuePct,
        valueMinor: outcome.discount.valueMinor,
        amountMinor: -off,
      },
    ],
    ...base,
  };
}

/**
 * Stage 3. The invitee's €100 off their first booking. Not an `applied`
 * adjustment: `price_adjustment_source` is `rule | discount`, and this is
 * neither a Manage Prices rule nor a row in the `discount` table.
 */
async function applyWelcomeDiscount(
  db: DatabaseExecutor,
  lines: QuoteLine[],
  userId: string | null,
  currency: string,
): Promise<{ lines: QuoteLine[] }> {
  const off = await welcomeDiscountMinor(db, userId, totalMinor(lines), payableNowMinor(lines));

  if (off <= 0) return { lines };

  return {
    lines: [
      ...lines,
      {
        code: "referral-welcome",
        label: "Referral welcome discount",
        amountMinor: -off,
        currency,
        payWhen: "now",
        kind: "discount",
      },
    ],
  };
}

/** Stage 4. Credit is a way of paying, so it never enters `applied`. */
async function applyReferralCredit(
  db: DatabaseExecutor,
  lines: QuoteLine[],
  userId: string | null,
  currency: string,
): Promise<{ lines: QuoteLine[]; creditApplied: PersistedQuote["creditApplied"] }> {
  const spendable = await spendableCreditMinor(
    db,
    userId,
    totalMinor(lines),
    payableNowMinor(lines),
  );

  if (spendable <= 0) return { lines, creditApplied: null };

  return {
    lines: [
      ...lines,
      {
        code: "referral-credit",
        label: "Referral credit",
        amountMinor: -spendable,
        currency,
        payWhen: "now",
        kind: "credit",
      },
    ],
    creditApplied: { amountMinor: spendable, currency },
  };
}

/** Stage 5. Reads the listing override, then derives the deposit from the policy. */
async function resolveDeposit(
  db: DatabaseExecutor,
  listingId: string,
  providerPolicy: ProviderQuote["paymentPolicy"],
  lines: QuoteLine[],
  currency: string,
): Promise<{ paymentPolicy: QuotePaymentPolicy; total: number; depositMinor: number }> {
  const [listingRow] = await db
    .select({ paymentPolicy: listing.paymentPolicy })
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);

  const paymentPolicy = resolvePaymentPolicy(
    listingRow?.paymentPolicy ?? null,
    providerPolicy,
    currency,
  );

  const payable = payableNowMinor(lines);

  return {
    paymentPolicy,
    total: totalMinor(lines),
    depositMinor:
      paymentPolicy.mode === "full" ? payable : Math.round(payable * paymentPolicy.depositPct),
  };
}

/**
 * provider price → internal rules → discount → welcome discount → credit →
 * payment policy.
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
    crewType: CrewType | null;
    discountCode: string | null;
    applyCredit: boolean;
  },
): Promise<PersistedQuote> {
  const currency = priced.currency;
  const onDate = priced.checkIn;

  let lines: QuoteLine[] = priced.lines.map((line) => {
    const mapped: QuoteLine = {
      code: line.code,
      label: line.label,
      amountMinor: line.amount.amountMinor,
      currency: line.amount.currency,
      payWhen: line.payWhen,
      kind: line.kind,
    };
    if (line.group) mapped.group = line.group;
    return mapped;
  });

  const applied: AppliedAdjustment[] = [];

  // 1. Internal price_adjustment_rule, against the charter base.
  const rules = await applyInternalRules(db, lines, priced.listingId, onDate);
  lines = rules.lines;
  applied.push(...rules.applied);

  // 2. Marketing discount, off everything payable now.
  const promo = options.discountCode
    ? await applyDiscountCode(db, lines, options.discountCode, priced.listingId, onDate, currency)
    : null;

  if (promo) {
    lines = promo.lines;
    applied.push(...promo.applied);
  }

  // 3. The invitee's referral welcome discount, if this is their first booking.
  const welcome = await applyWelcomeDiscount(db, lines, options.userId, currency);
  lines = welcome.lines;

  // 4. Referral credit, last: it is a way of paying rather than a price change,
  // so it comes off after everything that decides what the trip costs.
  const credit = options.applyCredit
    ? await applyReferralCredit(db, lines, options.userId, currency)
    : null;

  if (credit) lines = credit.lines;

  // 5. Payment policy, then the deposit that follows from it.
  const { paymentPolicy, total, depositMinor } = await resolveDeposit(
    db,
    priced.listingId,
    priced.paymentPolicy,
    lines,
    currency,
  );

  const appliedDiscount = promo?.discount ?? null;
  const discountRejected = promo?.rejected ?? null;
  const creditApplied = credit?.creditApplied ?? null;

  // The provider is the authority on what it was asked to price; the request only
  // fills in for an adapter that does not echo the choice back.
  const crewType = priced.crewType ?? options.crewType;

  const quoteId = await insertQuote(db, {
    priced,
    lines,
    total,
    depositMinor,
    paymentPolicy,
    userId: options.userId,
    extras: options.extras,
    crewType,
    discountId: promo?.discountId ?? null,
    discountCode: appliedDiscount?.code ?? null,
    creditAppliedMinor: creditApplied?.amountMinor ?? 0,
    applied,
  });

  const securityDepositMinor = priced.securityDeposit?.amountMinor ?? null;

  return {
    ...priced,
    quoteId,
    crewType,
    lines: lines.map((line) => {
      const mapped: PersistedQuote["lines"][number] = {
        code: line.code,
        label: line.label,
        amount: { amountMinor: line.amountMinor, currency: line.currency },
        payWhen: line.payWhen,
        kind: line.kind,
      };
      if (line.group) mapped.group = line.group;
      return mapped;
    }),
    total: { amountMinor: total, currency },
    deposit: { amountMinor: depositMinor, currency },
    perPerson: toPerPerson(total, priced.guests, currency),
    paymentSchedule: buildPaymentSchedulePreview({
      lines,
      paymentPolicy,
      depositMinor,
      securityDepositMinor,
      checkIn: priced.checkIn,
      currency,
    }).map((entry) => ({
      kind: entry.kind,
      amount: { amountMinor: entry.amountMinor, currency: entry.currency },
      dueAt: entry.dueAt,
    })),
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

function toPerPerson(
  totalMinorAmount: number,
  guests: number,
  currency: string,
): PersistedQuote["perPerson"] {
  const amountMinor = perPersonMinor(totalMinorAmount, guests);
  return amountMinor === null ? null : { amountMinor, currency };
}

/**
 * `quote.crew_type` is plain text, so a value written before the enum existed, or
 * by hand, must not be handed back to a provider as if it were valid.
 */
export function asCrewType(value: string | null): CrewType | undefined {
  const parsed = crewTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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
    crewType: CrewType | null;
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
      crewType: input.crewType,
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
