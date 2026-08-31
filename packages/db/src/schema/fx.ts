import { date, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

/**
 * Reference rates for comparing catalogue prices, never for quoting or charging one.
 *
 * A quote holds a single currency and is settled in it (docs/open-questions-and-decisions.md
 * §4), so nothing here reaches a customer's total. What it exists for is the catalogue, where
 * `listing_search_doc` carries whatever each provider publishes in and the sort, the price
 * filter and every "from" aggregate would otherwise compare a dollar integer to a euro one.
 *
 * `rate` is units of `quote_currency` per one unit of `base_currency`, which is how the ECB
 * publishes its daily reference feed: USD 1.0857 means one euro buys 1.0857 dollars. Dividing
 * by it converts into the base, and that direction is why base and quote are named rather than
 * left implicit.
 *
 * `as_of` is the day the source stamped, not the day we fetched: a feed that stops updating
 * keeps answering, and only the source's own date can tell that apart from a fresh rate.
 */
export const fxRate = pgTable(
  "fx_rate",
  {
    id: id("fx"),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: numeric("rate", { precision: 20, scale: 10 }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("fx_rate_pair_idx").on(t.baseCurrency, t.quoteCurrency)],
);
