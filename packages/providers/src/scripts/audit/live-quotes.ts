/**
 * How often a catalogue card tells the truth, measured against a live quote.
 *
 * Samples cards the way a visitor meets them -- a plain browse, a length filter, a dated search
 * -- and asks the running API for a quote on exactly the charter each card names. A card is
 * right when the vendor sells that charter and, where the card claims a price for it, quotes the
 * same boat price. The report counts each verdict per scenario and groups the refusals by the
 * vendor's own reason, which is what says whether the fault is stale occupancy, a rule copy, or a
 * price.
 *
 * Goes through the API rather than the adapters so it exercises exactly what the site does. The
 * quote path is read-only at the vendor (NauSYS `freeYachts`, Booking Manager `/offers`), but it
 * writes a quote row into our database and records a refusal where the vendor declines, as a
 * visitor's quote would. Run it against the local stack, never production.
 *
 *   pnpm --filter @yacht-charter/providers audit:quotes -- --samples 30 --out report.json
 */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { z } from "zod";

const { values: args } = parseArgs({
  /* pnpm forwards the `--` that separates its own flags, which parseArgs reads as a terminator. */
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    api: { type: "string", default: "http://localhost:3000" },
    samples: { type: "string", default: "25" },
    concurrency: { type: "string", default: "2" },
    guests: { type: "string", default: "2" },
    out: { type: "string" },
    /* Only the scenarios whose name contains this, to re-run one without the rest. */
    scenario: { type: "string" },
  },
});

const API = args.api.replace(/\/$/, "");
const SAMPLES = Number(args.samples);
const CONCURRENCY = Number(args.concurrency);
const GUESTS = Number(args.guests);
const PAGE_SIZE = 20;
/* Within this share the card and the quote are the same price, rounding and FX aside. */
const PRICE_TOLERANCE = 0.01;

const moneySchema = z.object({ amountMinor: z.number(), currency: z.string() });
const periodSchema = z.object({ checkIn: z.string(), checkOut: z.string() });

const searchSchema = z.object({
  items: z.array(
    z.object({
      checkIn: z.string().nullable(),
      checkOut: z.string().nullable(),
      listing: z.object({
        id: z.string(),
        slug: z.string(),
        basePriceFrom: moneySchema.nullable(),
        priceIsFrom: z.boolean(),
        availability: z.object({ bookablePeriod: periodSchema.nullable() }),
      }),
    }),
  ),
  pagination: z.object({ totalItems: z.number(), totalPages: z.number() }),
});

const quoteSchema = z.object({
  provider: z.string(),
  currency: z.string(),
  lines: z.array(z.object({ kind: z.string(), amount: moneySchema })),
  total: moneySchema,
});

const errorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

type Card = z.infer<typeof searchSchema>["items"][number];

type Verdict =
  | "sells, price matches"
  | "sells, price differs"
  | "sells, card shows no own price"
  | "vendor refuses the charter"
  | "card names no charter"
  | "quote failed";

type Result = {
  scenario: string;
  slug: string;
  listingId: string;
  checkIn: string | null;
  checkOut: string | null;
  verdict: Verdict;
  provider?: string;
  cardBaseMinor?: number;
  quoteBaseMinor?: number;
  diffPct?: number;
  reason?: string;
};

function isoIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const SCENARIOS: { name: string; query: Record<string, string> }[] = [
  { name: "browse", query: {} },
  { name: "3 days, no date", query: { duration: "3" } },
  { name: "7 days, no date", query: { duration: "7" } },
  {
    name: "7 days from a date +/- 1 week",
    query: { startDate: isoIn(45), duration: "7", dateFlexibility: "1-week" },
  },
  { name: "3 days on a date", query: { startDate: isoIn(30), duration: "3" } },
];

async function search(query: Record<string, string>, page: number) {
  const params = new URLSearchParams({
    currency: "EUR",
    locale: "en",
    priceBasis: "base",
    page: String(page),
    pageSize: String(PAGE_SIZE),
    ...query,
  });
  const response = await fetch(`${API}/api-reference/charter-search/results?${params}`);
  if (!response.ok) throw new Error(`search ${params} answered ${response.status}`);
  return searchSchema.parse(await response.json());
}

/* Distinct cards from random pages, so a sample is not just the top of the default order. */
async function sampleCards(query: Record<string, string>): Promise<Card[]> {
  const first = await search(query, 1);
  const pages = Math.max(1, first.pagination.totalPages);
  const seen = new Map<string, Card>();
  for (let attempt = 0; seen.size < SAMPLES && attempt < SAMPLES * 3; attempt += 1) {
    const page = 1 + Math.floor(Math.random() * pages);
    const { items } = page === 1 ? first : await search(query, page);
    const card = items[Math.floor(Math.random() * items.length)];
    if (card && !seen.has(card.listing.id)) seen.set(card.listing.id, card);
  }
  return [...seen.values()];
}

async function audit(scenario: string, card: Card): Promise<Result> {
  const { listing } = card;
  const period =
    card.checkIn && card.checkOut
      ? { checkIn: card.checkIn, checkOut: card.checkOut }
      : listing.availability.bookablePeriod;
  const base: Result = {
    scenario,
    slug: listing.slug,
    listingId: listing.id,
    checkIn: period?.checkIn ?? null,
    checkOut: period?.checkOut ?? null,
    verdict: "card names no charter",
  };
  if (!period) return base;

  const response = await fetch(`${API}/api-reference/availability/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      listingId: listing.id,
      checkIn: period.checkIn,
      checkOut: period.checkOut,
      guests: GUESTS,
      currency: "EUR",
      locale: "en",
    }),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    const reason = error.success
      ? `${error.data.code ?? response.status}: ${error.data.message ?? ""}`
      : String(response.status);
    const refused = response.status >= 400 && response.status < 500;
    return { ...base, verdict: refused ? "vendor refuses the charter" : "quote failed", reason };
  }

  const quote = quoteSchema.parse(body);
  /*
   * The card prints the charter net of the operator's discount, and the quote carries that
   * discount as lines of its own beside a base at list price, so the two compare only once the
   * discounts are taken off the base.
   */
  const listBase = quote.lines.find((line) => line.kind === "base")?.amount.amountMinor;
  const discounts = quote.lines
    .filter((line) => line.kind === "discount")
    .reduce((sum, line) => sum + line.amount.amountMinor, 0);
  const quoteBase = listBase === undefined ? undefined : listBase + discounts;
  const claimsOwnPrice = listing.basePriceFrom && !listing.priceIsFrom;
  if (!claimsOwnPrice || quoteBase === undefined || !listing.basePriceFrom) {
    return {
      ...base,
      provider: quote.provider,
      verdict: "sells, card shows no own price",
      quoteBaseMinor: quoteBase,
    };
  }

  const cardBase = listing.basePriceFrom.amountMinor;
  const diffPct = quoteBase === 0 ? 0 : (cardBase - quoteBase) / quoteBase;
  return {
    ...base,
    provider: quote.provider,
    cardBaseMinor: cardBase,
    quoteBaseMinor: quoteBase,
    diffPct: Math.round(diffPct * 1000) / 10,
    verdict: Math.abs(diffPct) <= PRICE_TOLERANCE ? "sells, price matches" : "sells, price differs",
  };
}

async function pool<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}

async function main(): Promise<void> {
  const results: Result[] = [];

  const chosen = SCENARIOS.filter(
    (scenario) => !args.scenario || scenario.name.includes(args.scenario),
  );
  for (const scenario of chosen) {
    const cards = await sampleCards(scenario.query);
    console.log(`\n${scenario.name}: auditing ${cards.length} cards`);
    const scenarioResults = await pool(cards, CONCURRENCY, (card) =>
      audit(scenario.name, card).catch(
        (error: Error): Result => ({
          scenario: scenario.name,
          slug: card.listing.slug,
          listingId: card.listing.id,
          checkIn: card.checkIn,
          checkOut: card.checkOut,
          verdict: "quote failed",
          reason: error.message,
        }),
      ),
    );
    results.push(...scenarioResults);
    /* Written after every scenario, so a run that dies half way still leaves what it measured. */
    if (args.out) await writeFile(args.out, JSON.stringify(results, null, 2));

    const counts = new Map<Verdict, number>();
    for (const result of scenarioResults)
      counts.set(result.verdict, (counts.get(result.verdict) ?? 0) + 1);
    for (const [verdict, count] of counts)
      console.log(`  ${String(count).padStart(4)}  ${verdict}`);

    const diffs = scenarioResults.filter((result) => result.verdict === "sells, price differs");
    for (const result of diffs.slice(0, 5)) {
      console.log(
        `        price ${result.diffPct}% ${result.provider} ${result.slug} ${result.checkIn}..${result.checkOut}`,
      );
    }
  }

  const reasons = new Map<string, number>();
  for (const result of results) {
    if (result.reason) reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
  }
  console.log("\nRefusal and failure reasons:");
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason.slice(0, 160)}`);
  }

  if (args.out) {
    await writeFile(args.out, JSON.stringify(results, null, 2));
    console.log(`\nEvery result written to ${args.out}`);
  }
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
