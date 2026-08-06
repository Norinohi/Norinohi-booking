/*
 * Minimal price-adjustment resolution, just enough for the staff Manage Prices
 * table to show Base Price next to Current Price.
 *
 * The full M4 pipeline (provider clientPrice → rules → discounts/referral →
 * payment policy → quote) supersedes this. Keep the semantics here identical when
 * that lands, or the admin table and the customer quote will disagree.
 *
 * Semantics of price_adjustment_type, settled against the Figma create/edit modal
 * and its Percentage | Fixed radio:
 *   percentage   — valuePct is a discount percentage off the base price.
 *   fixed_amount — valueMinor is the absolute replacement price, not a delta. This
 *                  is what "Edit Price → New Price" writes.
 * docs/backend-architecture.md §1.6 proposes splitting fixed into delta/override;
 * the two-value enum already in the schema is what the design needs.
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

export type ResolvedPrice = {
  amountMinor: number;
  appliedRuleId: string | null;
  appliedRuleLabel: string | null;
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

  for (const adjustment of ordered) {
    const next = applyOne(amountMinor, adjustment);
    if (next === null) continue;

    amountMinor = next;
    appliedRuleId ??= adjustment.id;
    appliedRuleLabel ??= adjustment.name;

    if (!adjustment.stackable) break;
  }

  return { amountMinor: Math.max(amountMinor, 0), appliedRuleId, appliedRuleLabel };
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
