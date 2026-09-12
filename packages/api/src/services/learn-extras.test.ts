import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { describe, expect, it } from "vitest";

import type { Database } from "../context";
import { learnExtrasFromQuote } from "./learn-extras";

type Line = Parameters<typeof learnExtrasFromQuote>[1]["lines"][number];
type Row = typeof providerExtraCatalogue.$inferInsert;

function line(overrides: Partial<Line> & { code: string }): Line {
  return {
    label: "Final cleaning",
    amount: { amountMinor: 40000, currency: "EUR" },
    payWhen: "now",
    kind: "extra",
    group: "mandatory",
    ...overrides,
  };
}

/** Enough of the executor for the lookup and the insert, with the published rows in the test's hands. */
function fakeDb(published: string[]) {
  const inserted: Row[][] = [];
  // SAFETY: a stub with nothing behind it. Only the two builders this service reaches for
  // exist, so any other Drizzle call is a TypeError rather than a quietly wrong answer.
  const db = Object.assign({} as Database, {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(published.map((externalId) => ({ externalId }))),
      }),
    }),
    insert: () => ({
      values: (rows: Row[]) => ({
        onConflictDoNothing: () => {
          inserted.push(rows);
          return Promise.resolve();
        },
      }),
    }),
  });

  return { db, inserted };
}

const input = { listingId: "ylst_1", listingOfferId: "lofr_1", provider: "booking_manager" };

describe("learnExtrasFromQuote", () => {
  it("writes an obligatory extra the offer's catalogue has no row for", async () => {
    const { db, inserted } = fakeDb([]);

    const learned = await learnExtrasFromQuote(db, {
      ...input,
      lines: [line({ code: "service:5633860987503582", label: "Damage waiver" })],
    });

    expect(learned).toBe(1);
    expect(inserted[0]?.[0]).toMatchObject({
      listingId: "ylst_1",
      listingOfferId: "lofr_1",
      source: "booking_manager",
      kind: "service",
      externalId: "5633860987503582",
      name: "Damage waiver",
      obligatory: true,
      priceMinor: 40000,
      priceCurrency: "EUR",
    });
    expect(inserted[0]?.[0]?.learnedAt).toBeInstanceOf(Date);
  });

  /* A published row states a list price with the seasons and bases it applies to; a quote
     knows one charter, so it must not overwrite one. */
  it("leaves a code the vendor already publishes alone", async () => {
    const { db, inserted } = fakeDb(["5633860987503582"]);

    const learned = await learnExtrasFromQuote(db, {
      ...input,
      lines: [line({ code: "service:5633860987503582" })],
    });

    expect(learned).toBe(0);
    expect(inserted).toEqual([]);
  });

  it("learns nothing from optional extras, the base line or a discount", async () => {
    const { db, inserted } = fakeDb([]);

    const learned = await learnExtrasFromQuote(db, {
      ...input,
      lines: [
        line({ code: "service:1", group: "optional" }),
        line({ code: "service:2", group: "crew" }),
        line({ code: "base-charter", kind: "base", group: undefined }),
        line({ code: "bm-discount", kind: "discount", group: undefined }),
      ],
    });

    expect(learned).toBe(0);
    expect(inserted).toEqual([]);
  });

  /* Writing our own placeholder into the catalogue would turn a gap into a claim. */
  it("refuses a line the vendor never named", async () => {
    const { db, inserted } = fakeDb([]);

    const learned = await learnExtrasFromQuote(db, {
      ...input,
      lines: [line({ code: "service:52", label: "Charter extra" })],
    });

    expect(learned).toBe(0);
    expect(inserted).toEqual([]);
  });
});
