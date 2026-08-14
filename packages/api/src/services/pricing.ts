import { priceAdjustmentRule, priceAdjustmentTarget } from "@yacht-charter/db/schema/admin";
import { listing } from "@yacht-charter/db/schema/listing";
import type { QuoteLine, QuotePaymentPolicy } from "@yacht-charter/db/schema/quote";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import type { Database } from "../context";

/*
 * The internal pricing pipeline (docs/backend-architecture.md §1.5, §6.3):
 *
 *   provider price → price_adjustment_rule → discount → payment_policy
 *
 * Order matters. Internal rules move the charter price itself — they are what the
 * admin Manage Prices screen edits — and a marketing discount comes off whatever
 * that leaves, never the other way round.
 *
 * Semantics of price_adjustment_type, settled against the Figma create/edit modal
 * and its Percentage | Fixed radio:
 *   percentage   — valuePct is a percentage off.
 *   fixed_amount — for a rule, valueMinor is the absolute replacement charter
 *                  price (what "Edit Price → New Price" writes); for a discount,
 *                  it is an amount taken off.
 */

export type PriceAdjustment = {
  id: string;
  name: string;
  type: "percentage" | "fixed_amount";
  valuePct: string | number | null;
  valueMinor: number | null;
  priority: number;
  stackable: boolean;
};

export type AppliedAdjustment = {
  source: "rule" | "discount";
  sourceId: string;
  name: string;
  type: "percentage" | "fixed_amount";
  valuePct: number | null;
  valueMinor: number | null;
  /** Signed delta in minor units. Negative reduces the price. */
  amountMinor: number;
};

export type ResolvedPrice = {
  amountMinor: number;
  appliedRuleId: string | null;
  appliedRuleLabel: string | null;
  applied: AppliedAdjustment[];
};

/**
 * Applies `adjustments` to `baseMinor`, highest priority first. A non-stackable
 * rule wins outright and ends the chain; stackable rules compose in order.
 */
export function resolveAdjustedPrice(
  baseMinor: number,
  adjustments: readonly PriceAdjustment[],
): ResolvedPrice {
  const ordered = [...adjustments].sort((a, b) => b.priority - a.priority);

  let amountMinor = baseMinor;
  let appliedRuleId: string | null = null;
  let appliedRuleLabel: string | null = null;
  const applied: AppliedAdjustment[] = [];

  for (const adjustment of ordered) {
    const next = applyOne(amountMinor, adjustment);
    if (next === null) continue;

    const delta = next - amountMinor;
    amountMinor = next;
    appliedRuleId ??= adjustment.id;
    appliedRuleLabel ??= adjustment.name;

    if (delta !== 0) {
      applied.push({
        source: "rule",
        sourceId: adjustment.id,
        name: adjustment.name,
        type: adjustment.type,
        valuePct: adjustment.valuePct === null ? null : Number(adjustment.valuePct),
        valueMinor: adjustment.valueMinor,
        amountMinor: delta,
      });
    }

    if (!adjustment.stackable) break;
  }

  return { amountMinor: Math.max(amountMinor, 0), appliedRuleId, appliedRuleLabel, applied };
}

function applyOne(amountMinor: number, adjustment: PriceAdjustment): number | null {
  if (adjustment.type === "percentage") {
    const pct = Number(adjustment.valuePct);
    if (!Number.isFinite(pct)) return null;
    return Math.round(amountMinor * (1 - pct / 100));
  }

  if (adjustment.valueMinor === null) return null;
  return adjustment.valueMinor;
}

/**
 * Every active, in-window rule that targets these listings, by any target type.
 *
 * A rule can point at the listing itself, its operator, its region, its category,
 * or at everything — so the listing's own operator/region/category are resolved
 * first and the whole lot matched in one query rather than one per target type.
 */
export async function loadAdjustmentsForListings(
  db: Database,
  listingIds: readonly string[],
  onDate: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, PriceAdjustment[]>> {
  const byListing = new Map<string, PriceAdjustment[]>();
  if (listingIds.length === 0) return byListing;

  const owners = await db
    .select({
      listingId: listing.id,
      operatorId: listing.operatorId,
      categoryId: listing.categoryId,
      baseId: listing.homeBaseId,
    })
    .from(listing)
    .where(inArray(listing.id, [...listingIds]));

  const rows = await loadRulesTargeting(db, owners, onDate);

  for (const owner of owners) {
    // One rule can match through two targets; keep it once.
    const unique = new Map<string, PriceAdjustment>();

    for (const row of rows.filter((row) => targets(row, owner))) {
      unique.set(row.id, {
        id: row.id,
        name: row.name,
        type: row.type,
        valuePct: row.valuePct,
        valueMinor: row.valueMinor,
        priority: row.priority,
        stackable: row.stackable,
      });
    }

    byListing.set(owner.listingId, [...unique.values()]);
  }

  return byListing;
}

type ListingOwner = {
  listingId: string;
  operatorId: string | null;
  categoryId: string | null;
};

/** Every active, in-window rule pointed at any id these listings answer to. */
function loadRulesTargeting(db: Database, owners: ListingOwner[], onDate: string) {
  // Every id a rule could legitimately be pointed at for these listings.
  const targetIds = new Set<string>();
  for (const owner of owners) {
    targetIds.add(owner.listingId);
    if (owner.operatorId) targetIds.add(owner.operatorId);
    if (owner.categoryId) targetIds.add(owner.categoryId);
  }

  return db
    .select({
      targetType: priceAdjustmentTarget.targetType,
      targetId: priceAdjustmentTarget.targetId,
      id: priceAdjustmentRule.id,
      name: priceAdjustmentRule.name,
      type: priceAdjustmentRule.type,
      valuePct: priceAdjustmentRule.valuePct,
      valueMinor: priceAdjustmentRule.valueMinor,
      priority: priceAdjustmentRule.priority,
      stackable: priceAdjustmentRule.stackable,
    })
    .from(priceAdjustmentTarget)
    .innerJoin(priceAdjustmentRule, eq(priceAdjustmentRule.id, priceAdjustmentTarget.ruleId))
    .where(
      and(
        eq(priceAdjustmentRule.active, true),
        or(isNull(priceAdjustmentRule.startsAt), lte(priceAdjustmentRule.startsAt, onDate)),
        or(isNull(priceAdjustmentRule.endsAt), gte(priceAdjustmentRule.endsAt, onDate)),
        // `all` carries a null targetId, so it cannot be matched by an IN list.
        or(
          eq(priceAdjustmentTarget.targetType, "all"),
          targetIds.size > 0
            ? inArray(priceAdjustmentTarget.targetId, [...targetIds])
            : eq(priceAdjustmentTarget.targetType, "all"),
        ),
      ),
    );
}

/**
 * The SQL above is deliberately loose — one query for the whole batch — so each
 * row is re-checked here against the listing it is being attributed to.
 */
function targets(
  row: { targetType: string; targetId: string | null },
  owner: ListingOwner,
): boolean {
  switch (row.targetType) {
    case "all":
      return true;
    case "listing":
      return row.targetId === owner.listingId;
    case "operator":
      return row.targetId === owner.operatorId;
    case "category":
      return row.targetId === owner.categoryId;
    // Regions hang off the base, which the search doc denormalizes by name.
    // Matching them needs a base→region join that no caller uses yet.
    case "region":
      return false;
    default:
      return false;
  }
}

export type ListingPaymentPolicy = {
  mode: "deposit" | "full";
  depositPct?: number;
  balanceDueAt?: string;
} | null;

/** Exported so the card quotes the same figure checkout falls back to, rather than its own. */
export const MARKETPLACE_DEFAULT = { mode: "deposit" as const, depositPct: 0.5 };

/**
 * §6.3: explicit listing override → the provider's own plan → the marketplace
 * default. Never a hardcoded 50/100 — this is what makes a listing able to demand
 * full prepayment while its neighbour takes half.
 */
export function resolvePaymentPolicy(
  listingOverride: ListingPaymentPolicy,
  providerPolicy: { mode: "deposit" | "full"; depositPct: number; balanceDueAt?: string },
  currency: string,
): QuotePaymentPolicy {
  const chosen = listingOverride ?? providerPolicy ?? MARKETPLACE_DEFAULT;
  const mode = chosen.mode ?? MARKETPLACE_DEFAULT.mode;

  return {
    mode,
    // Paying in full is 100% by definition; a deposit falls back to the default
    // percentage when the source did not say.
    depositPct: mode === "full" ? 1 : (chosen.depositPct ?? MARKETPLACE_DEFAULT.depositPct),
    balanceDueAt: chosen.balanceDueAt ?? providerPolicy?.balanceDueAt,
    currency,
  };
}

/** The part of a quote we actually collect up front. */
export function payableNowMinor(lines: readonly QuoteLine[]): number {
  return Math.max(
    lines
      .filter((line) => line.payWhen === "now")
      .reduce((total, line) => total + line.amountMinor, 0),
    0,
  );
}

export function totalMinor(lines: readonly QuoteLine[]): number {
  return Math.max(
    lines.reduce((total, line) => total + line.amountMinor, 0),
    0,
  );
}

/** What the base collects on arrival: never part of the prepayment. */
export function payableAtCheckInMinor(lines: readonly QuoteLine[]): number {
  return Math.max(
    lines
      .filter((line) => line.payWhen === "at_check_in")
      .reduce((total, line) => total + line.amountMinor, 0),
    0,
  );
}

export type QuotePaymentScheduleEntry = {
  kind: "deposit" | "balance" | "full" | "checkin_extras" | "security_deposit";
  amountMinor: number;
  currency: string;
  /** Null means due now. */
  dueAt: string | null;
};

/**
 * The instalments implied by a priced quote, in the order the customer meets them.
 *
 * Derived rather than stored: quotes are immutable and a booking's real
 * `payment_schedule` rows are only written when a payment starts, so this is what
 * the checkout sidebar renders before there is a booking at all. The first entry
 * is always what `checkout.confirm` will charge, so the two cannot disagree.
 */
export function buildPaymentSchedulePreview(input: {
  lines: readonly QuoteLine[];
  paymentPolicy: QuotePaymentPolicy;
  depositMinor: number;
  securityDepositMinor: number | null;
  checkIn: string;
  currency: string;
}): QuotePaymentScheduleEntry[] {
  const { currency } = input;
  const entries: QuotePaymentScheduleEntry[] = [];
  const payableNow = payableNowMinor(input.lines);

  if (input.paymentPolicy.mode === "full") {
    entries.push({ kind: "full", amountMinor: payableNow, currency, dueAt: null });
  } else {
    entries.push({ kind: "deposit", amountMinor: input.depositMinor, currency, dueAt: null });

    const balanceMinor = payableNow - input.depositMinor;
    if (balanceMinor > 0) {
      entries.push({
        kind: "balance",
        amountMinor: balanceMinor,
        currency,
        // A policy with no balance date still owes the balance; the sidebar shows
        // it undated rather than dropping the instalment.
        dueAt: input.paymentPolicy.balanceDueAt ?? null,
      });
    }
  }

  const atCheckIn = payableAtCheckInMinor(input.lines);
  if (atCheckIn > 0) {
    entries.push({
      kind: "checkin_extras",
      amountMinor: atCheckIn,
      currency,
      dueAt: input.checkIn,
    });
  }

  // Refundable, so it is not in the total, but the customer is still asked for it
  // at the base and the summary has to say so.
  if (input.securityDepositMinor && input.securityDepositMinor > 0) {
    entries.push({
      kind: "security_deposit",
      amountMinor: input.securityDepositMinor,
      currency,
      dueAt: input.checkIn,
    });
  }

  return entries;
}

/** Null rather than a division by zero; a quote always has at least one guest. */
export function perPersonMinor(totalMinorAmount: number, guests: number): number | null {
  if (!Number.isFinite(guests) || guests <= 0) return null;
  return Math.round(totalMinorAmount / guests);
}
