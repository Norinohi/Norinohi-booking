import { eq, sql, type SQL } from "drizzle-orm";
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
 * The hryvnia, which the ECB stopped publishing a reference rate for in 2022.
 *
 * A second source for exactly one currency, because the client asked for prices in UAH and
 * there is no other way to have them: without a rate the display layer refuses to convert, so
 * the switcher offered a currency that quietly did nothing. Free and keyless like the ECB feed,
 * and quoted the same way round -- hryvnia per one euro -- so the row is shaped identically and
 * nothing downstream needs to know where it came from beyond the `source` column.
 */
const NBU_EUR_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json";

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

/* Ukrainian dates arrive as dd.mm.yyyy, which sorts and compares as nothing at all. */
const NBU_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const nbuSchema = z
  .array(
    z.object({
      cc: z.literal("EUR"),
      rate: z.number().positive().finite(),
      exchangedate: z.string().regex(NBU_DATE),
    }),
  )
  .min(1);

export type FxRefreshResult = {
  asOf: string;
  currencies: number;
  /**
   * The day the hryvnia rate is stamped, or null where the bank did not answer.
   *
   * Null rather than a throw: the ECB half of this refresh has already been written by then,
   * and losing thirty currencies because one second source was down would be the wrong trade.
   * A missing rate ages out on the same rule as any other, so prices simply stay in the
   * vendor's currency until it returns.
   */
  uahAsOf: string | null;
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

  return {
    asOf: envelope.asOf,
    currencies: envelope.quotes.length,
    uahAsOf: await refreshHryvniaRate(db, fetchImpl),
  };
}

/**
 * The one rate the ECB does not carry, from the National Bank of Ukraine.
 *
 * Swallows its own failures and reports them as a null date. Everything about the hryvnia is
 * best-effort by construction: it is one currency, from a source the rest of the table does not
 * depend on, and the display layer already treats a missing rate as "show the published price".
 */
async function refreshHryvniaRate(
  db: NodePgDatabase<typeof schema>,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(NBU_EUR_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const quote = parseNbuRate(await response.text());

    await db
      .insert(fxRate)
      .values({
        baseCurrency: FX_BASE_CURRENCY,
        quoteCurrency: "UAH",
        rate: quote.rate.toString(),
        asOf: quote.asOf,
        source: "nbu",
      })
      .onConflictDoUpdate({
        target: [fxRate.baseCurrency, fxRate.quoteCurrency],
        set: {
          rate: sql`excluded.rate`,
          asOf: sql`excluded.as_of`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
        where: sql`excluded.as_of >= ${fxRate.asOf}`,
      });

    return quote.asOf;
  } catch {
    /* A bank that is down, slow, or answering something new. The catalogue does not compare in
       hryvnia and never did, so nothing here is worth failing the daily refresh over. */
    return null;
  }
}

/**
 * The bank's answer as a rate and an ISO date, or a throw the caller turns into "no rate".
 *
 * Takes the response body rather than a decoded object, the same way `parseEcbEnvelope` takes
 * the XML: the parse belongs at the boundary, and a caller that had already decoded it would
 * have nothing but `unknown` to hand over.
 */
export function parseNbuRate(json: string) {
  const quotes = nbuSchema.parse(JSON.parse(json));
  /* The schema guarantees one, which the array index cannot express under noUncheckedIndexedAccess. */
  const quote = quotes[0];
  if (!quote) throw new Error("NBU returned no euro rate");

  const parts = NBU_DATE.exec(quote.exchangedate);
  if (!parts) throw new Error(`NBU returned an unreadable date: ${quote.exchangedate}`);

  return { rate: quote.rate, asOf: `${parts[3]}-${parts[2]}-${parts[1]}` };
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
/**
 * Every stored rate, for the browser to convert displayed prices with.
 *
 * The whole table rather than a filtered set: it is a few dozen rows the client caches for a
 * long time, and narrowing it to the currencies we happen to offer today would make adding one
 * a deployment.
 *
 * Each rate carries its own source stamp rather than the table sharing one. Two banks write
 * here on two schedules, so a single date would be somebody's -- and taking the newest would
 * let a hryvnia updated this morning vouch for euro rates that stopped a fortnight ago, which
 * is precisely the failure `MAX_RATE_AGE_DAYS` exists to catch.
 */
export async function readFxSnapshot(db: NodePgDatabase<typeof schema>): Promise<{
  base: string;
  maxAgeDays: number;
  rates: Record<string, { rate: number; asOf: string }>;
}> {
  const rows = await db
    .select({
      quoteCurrency: fxRate.quoteCurrency,
      rate: fxRate.rate,
      asOf: fxRate.asOf,
    })
    .from(fxRate)
    .where(eq(fxRate.baseCurrency, FX_BASE_CURRENCY));

  const rates: Record<string, { rate: number; asOf: string }> = {};

  for (const row of rows) {
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    rates[row.quoteCurrency] = { rate, asOf: row.asOf };
  }

  return { base: FX_BASE_CURRENCY, maxAgeDays: MAX_RATE_AGE_DAYS, rates };
}

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
