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

  // Every id a rule could legitimately be pointed at for these listings.
  const targetIds = new Set<string>();
  for (const owner of owners) {
    targetIds.add(owner.listingId);
    if (owner.operatorId) targetIds.add(owner.operatorId);
    if (owner.categoryId) targetIds.add(owner.categoryId);
  }

  const rows = await db
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

  for (const owner of owners) {
    const matches = rows.filter((row) => {
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
    });

    // One rule can match through two targets; keep it once.
    const unique = new Map<string, PriceAdjustment>();
    for (const match of matches) {
      unique.set(match.id, {
        id: match.id,
        name: match.name,
        type: match.type,
        valuePct: match.valuePct,
        valueMinor: match.valueMinor,
        priority: match.priority,
        stackable: match.stackable,
      });
    }

    byListing.set(owner.listingId, [...unique.values()]);
  }

  return byListing;
}

export type ListingPaymentPolicy = {
  mode: "deposit" | "full";
  depositPct?: number;
  balanceDueAt?: string;
} | null;

const MARKETPLACE_DEFAULT = { mode: "deposit" as const, depositPct: 0.5 };

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
