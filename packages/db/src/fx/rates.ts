import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import type * as schema from "../schema";
import { fxRate } from "../schema/fx";

/**
 * The currency the catalogue compares in. Not a currency anything is charged in: a quote holds
 * one currency and is settled in it, so nothing converted here reaches a customer's total.
 */
export const FX_BASE_CURRENCY = "EUR";

/**
 * How old a reference rate may be before we stop comparing with it.
 *
 * The ECB publishes on TARGET working days, so an ordinary Christmas or Easter run of holidays
 * leaves the newest rate four days behind. Seven survives that and still catches a feed that
 * has actually stopped, which is the failure worth noticing: a rate that silently freezes goes
 * on producing plausible orderings forever.
 *
 * Past it, a listing in that currency is not compared at all rather than compared wrongly. It
 * keeps its own published price on its card and drops out of the price filter and the "from"
 * aggregates until a rate returns.
 */
export const MAX_RATE_AGE_DAYS = 7;

/*
 * Free, keyless, and EUR-based, which is the base we compare in anyway. It publishes once per
 * working day, so fetching it more often than daily buys nothing.
 */
const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const FETCH_TIMEOUT_MS = 15_000;

/*
 * Two shallow reads rather than an XML parser: the feed is a fixed three-deep Cube nest that
 * has not changed shape in twenty years, and it is the only XML this repository consumes.
 * Everything the regexes pull out is validated below before it reaches the table.
 */
const ENVELOPE_DATE = /<Cube\s+time=['"]([^'"]+)['"]/;
const QUOTE_LINE = /<Cube\s+currency=['"]([^'"]+)['"]\s+rate=['"]([^'"]+)['"]/g;

const envelopeSchema = z.object({
  asOf: z.iso.date(),
  quotes: z
    .array(
      z.object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        rate: z.coerce.number().positive().finite(),
      }),
    )
    .min(1),
});

export type FxRefreshResult = {
  asOf: string;
  currencies: number;
};

/**
 * Pulls the ECB daily reference rates into `fx_rate`.
 *
 * Every currency the feed carries, not only the ones the catalogue currently lists: the rows
 * are tiny and a provider that starts publishing in a new currency then needs no deploy.
 *
 * Injectable `fetch` so the parse and the upsert are testable without a network.
 */
export async function refreshFxRates(
  db: NodePgDatabase<typeof schema>,
  fetchImpl: typeof fetch = fetch,
): Promise<FxRefreshResult> {
  const response = await fetchImpl(ECB_DAILY_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`ECB reference rates responded ${response.status} ${response.statusText}`);
  }

  const envelope = parseEcbEnvelope(await response.text());

  await db
    .insert(fxRate)
    .values(
      envelope.quotes.map((quote) => ({
        baseCurrency: FX_BASE_CURRENCY,
        quoteCurrency: quote.currency,
        rate: quote.rate.toString(),
        asOf: envelope.asOf,
        source: "ecb",
      })),
    )
    .onConflictDoUpdate({
      target: [fxRate.baseCurrency, fxRate.quoteCurrency],
      set: {
        rate: sql`excluded.rate`,
        asOf: sql`excluded.as_of`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
      /* A re-run against a stale mirror must not walk the stored rate backwards in time. */
      where: sql`excluded.as_of >= ${fxRate.asOf}`,
    });

  return { asOf: envelope.asOf, currencies: envelope.quotes.length };
}

export function parseEcbEnvelope(xml: string): z.infer<typeof envelopeSchema> {
  const quotes = [...xml.matchAll(QUOTE_LINE)].map(([, currency, rate]) => ({ currency, rate }));

  return envelopeSchema.parse({ asOf: ENVELOPE_DATE.exec(xml)?.[1], quotes });
}

/**
 * The trusted rate for `currency`, or NULL where there is none.
 *
 * A scalar subquery rather than a join so callers can drop it into a lateral without changing
 * their row count, which in the search projection would silently multiply offers.
 */
export function usableRateSql(currency: SQL): SQL {
  return sql`(
    select fx.rate
    from fx_rate fx
    where fx.base_currency = ${FX_BASE_CURRENCY}
      and fx.quote_currency = ${currency}
      and fx.as_of >= current_date - ${sql.raw(String(MAX_RATE_AGE_DAYS))}
  )`;
}

/**
 * `amount` expressed in {@link FX_BASE_CURRENCY} minor units, or NULL when it cannot be.
 *
 * Null rather than the unconverted number, because the whole point of the column this feeds is
 * that every value in it is in one currency. A raw amount slipped in here would be indexed and
 * sorted beside converted ones, which is the bug this exists to fix.
 *
 * `rate` is passed in rather than looked up here so the caller can resolve it once per row;
 * inlining {@link usableRateSql} would run the subquery twice for every amount converted.
 */
export function toBaseMinorSql(amount: SQL, currency: SQL, rate: SQL): SQL {
  return sql`case
    when ${amount} is null then null
    when ${currency} = ${FX_BASE_CURRENCY} then ${amount}
    when ${rate} is null then null
    else round(${amount}::numeric / ${rate})::int
  end`;
}
