import type { CharterRule } from "@yacht-charter/api/lib/availability-rules";

/**
 * The charter-period rules a listing sells on, reduced to what is worth saying.
 *
 * `rules` is a list of alternatives — a period is legal if any one rule admits it — so a
 * listing can genuinely sell Saturday weeks in high season and short flexible stays in the
 * shoulder. Reading `rules[0]` would state one of those as if it were the whole truth.
 *
 * Rules that constrain nothing are dropped: they admit every period, so naming them tells a
 * customer nothing and would crowd out the rule that actually limits them. An empty result
 * means the listing is unconstrained and the caller should say nothing at all.
 */
export function summariseCharterRules(rules: readonly CharterRule[]): CharterRule[] {
  const seen = new Set<string>();
  const summary: CharterRule[] = [];

  for (const rule of rules) {
    if (constrainsNothing(rule)) continue;

    // Alternatives are often repeated across seasons that share a shape.
    const key = JSON.stringify([
      rule.checkinWeekday,
      rule.checkoutWeekday,
      rule.minNights,
      rule.maxNights,
    ]);
    if (seen.has(key)) continue;

    seen.add(key);
    summary.push(rule);
  }

  return summary;
}

function constrainsNothing(rule: CharterRule): boolean {
  return (
    rule.checkinWeekday === null &&
    rule.checkoutWeekday === null &&
    rule.minNights === null &&
    rule.maxNights === null
  );
}
