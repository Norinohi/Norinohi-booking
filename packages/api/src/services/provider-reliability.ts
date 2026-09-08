/*
 * How each vendor has been answering quote requests lately.
 *
 * Read-only, and shown rather than acted on: it is the measurement that would have to justify
 * letting reliability decide a sale, and putting it in front of staff before it decides
 * anything is the point. `quote_offer_attempt` has recorded every ask since the multi-offer
 * selection shipped, so the history is already there to read.
 *
 * The arithmetic lives in `reliabilityOf` rather than in the query, because a ratio computed
 * in SQL is a ratio nothing can test here.
 */
import { quoteOfferAttempt } from "@yacht-charter/db/schema/quote";
import { sql } from "drizzle-orm";
import type { z } from "zod";

import type { DatabaseExecutor } from "../context";
import type { providerReliabilityRowSchema, providerReliabilitySchema } from "../contracts/admin";

type Row = z.infer<typeof providerReliabilityRowSchema>;
type Report = z.infer<typeof providerReliabilitySchema>;

/**
 * What one vendor did over the window, before any of it becomes a rate.
 *
 * `answered` and `failed` are the two halves of the question "did the vendor respond": a
 * refusal is an answer, and only a connection that broke or ran out of time is not. `ineligible`
 * is in neither, because those never left our own process.
 */
export type ProviderCounts = {
  provider: string;
  answered: number;
  failed: number;
  ineligible: number;
  p50LatencyMs: number | null;
};

/**
 * The rates behind one vendor's counts.
 *
 * Null rather than zero on an empty window: a vendor nobody asked has no success rate, and 0%
 * would read as one that failed everything. Same reasoning as the duplicate matcher's
 * precision, and for the same reason -- these numbers are read as verdicts.
 */
export function reliabilityOf(counts: ProviderCounts): Row {
  const responded = counts.answered + counts.failed;

  return {
    provider: counts.provider,
    asked: responded + counts.ineligible,
    answered: counts.answered,
    failed: counts.failed,
    ineligible: counts.ineligible,
    successRatio: responded === 0 ? null : round4(counts.answered / responded),
    p50LatencyMs: counts.p50LatencyMs,
  };
}

/** Four places, matching how the duplicate metrics store theirs, so both read the same way. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * How few asks is too few to rank a vendor on.
 *
 * A connector switched on last week has answered a handful of times, and a rate off five asks
 * says nothing about the sixth. Below this the vendor reports no rate at all rather than a
 * confident-looking one, and the comparator skips the step for that pair -- silence is not
 * evidence of unreliability.
 */
const MIN_RANKING_SAMPLE = 50;

/**
 * The answer rate per provider, for the ranking rather than for a screen.
 *
 * Only providers with enough asks to measure appear. A caller reading a code that is absent
 * has its answer: this vendor is not rankable on reliability today.
 */
export async function reliabilityByProvider(
  db: DatabaseExecutor,
  windowDays: number,
): Promise<Map<string, number>> {
  const report = await providerReliability(db, { windowDays });
  return rankableRates(report.rows);
}

/** The measured half of the report, separated so the sample floor can be tested. */
export function rankableRates(rows: readonly Row[]): Map<string, number> {
  const rankable = rows.flatMap((row) => {
    if (row.successRatio === null) return [];
    if (row.answered + row.failed < MIN_RANKING_SAMPLE) return [];
    return [[row.provider, row.successRatio] as const];
  });

  return new Map(rankable);
}

export async function providerReliability(
  db: DatabaseExecutor,
  input: { windowDays: number },
): Promise<Report> {
  const since = sql`now() - make_interval(days => ${input.windowDays})`;

  /*
   * The median is taken over answers alone. A timeout's latency is our own ceiling rather than
   * the vendor's speed, so including it would measure the timeout setting; and an attempt that
   * never reached the vendor has no latency worth the name.
   */
  const result = await db.execute<{
    provider: string;
    answered: number;
    failed: number;
    ineligible: number;
    p50LatencyMs: number | null;
  }>(sql`
    select
      provider,
      count(*) filter (where outcome in ('won', 'lost', 'unavailable'))::int as answered,
      count(*) filter (where outcome in ('error', 'timeout'))::int as failed,
      count(*) filter (where outcome = 'ineligible')::int as ineligible,
      percentile_cont(0.5) within group (
        order by case when outcome in ('won', 'lost', 'unavailable') then latency_ms end
      )::int as "p50LatencyMs"
    from ${quoteOfferAttempt}
    where created_at >= ${since}
    group by provider
    order by provider
  `);

  return {
    windowDays: input.windowDays,
    /* Ordered by how much of the sale each vendor is actually answering for, so the one worth
       worrying about is at the top rather than wherever the alphabet put it. */
    rows: result.rows
      .map(reliabilityOf)
      .sort((left, right) => (left.successRatio ?? 1) - (right.successRatio ?? 1)),
  };
}
