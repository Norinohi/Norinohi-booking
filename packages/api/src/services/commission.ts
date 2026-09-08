/*
 * What we earn on a sale through one vendor, decided from the rates staff have entered.
 *
 * Pure and database-free on purpose. It is the half of the commission feature that can be
 * tested here, and it is the half worth testing: which of several overlapping agreements
 * applies to a particular charter is a question with a wrong answer, and the wrong answer
 * would quietly move sales between vendors.
 *
 * Nothing reads this yet. It exists so the ranking step the client agreed to can be switched
 * on by entering rates rather than by shipping code.
 */

/** One stored agreement, flattened to what deciding needs. Dates are ISO `yyyy-MM-dd`. */
export type CommissionRule = {
  id: string;
  providerCode: string;
  /** Null means every operator at this vendor. */
  operatorId: string | null;
  /** A percentage: 15 is fifteen percent, matching how it is stored and typed in. */
  ratePct: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export type CommissionQuery = {
  providerCode: string;
  /** The operator behind the offer, where the listing names one. */
  operatorId: string | null;
  /** The day the rate is asked about, normally the charter's check-in. */
  on: string;
};

/**
 * The rate that applies, or zero where nothing does.
 *
 * Zero rather than null because every caller would otherwise have to invent the same fallback,
 * and because an unpriced agreement genuinely earns nothing we can rank on. An empty table is
 * therefore the whole feature switched off, which is how it ships.
 *
 * Precedence, most specific first: a rate written for this operator beats one written for the
 * vendor at large, because that is the direction the negotiation ran. Two rules of equal
 * specificity are settled by taking the higher rate -- overlapping windows are possible (the
 * database cannot refuse them cheaply) and a deterministic answer that favours nobody's
 * carelessness is better than an arbitrary one.
 */
export function resolveCommissionRate(
  rules: readonly CommissionRule[],
  query: CommissionQuery,
): number {
  const eligible = rules.filter((rule) => applies(rule, query));
  if (eligible.length === 0) return 0;

  const operatorScoped = eligible.filter((rule) => rule.operatorId !== null);
  const considered = operatorScoped.length > 0 ? operatorScoped : eligible;

  return considered.reduce((best, rule) => Math.max(best, rule.ratePct), 0);
}

function applies(rule: CommissionRule, query: CommissionQuery): boolean {
  if (!rule.active) return false;
  if (rule.providerCode !== query.providerCode) return false;
  /* A rule naming an operator applies to that operator alone; one naming none applies to all. */
  if (rule.operatorId !== null && rule.operatorId !== query.operatorId) return false;
  return covers(rule, query.on);
}

/* Both ends inclusive, and ISO dates compare correctly as strings. */
function covers(rule: CommissionRule, day: string): boolean {
  if (rule.startsAt !== null && day < rule.startsAt) return false;
  if (rule.endsAt !== null && day > rule.endsAt) return false;
  return true;
}
