import { describe, expect, it } from "vitest";

import {
  faqCreateInputSchema,
  faqDeleteInputSchema,
  faqListInputSchema,
  faqUpdateInputSchema,
} from "./faq";

const english = { locale: "en" as const, question: "How do I book a yacht?" };

/*
 * `faq_scope_ck` says the same thing, but a check violation arrives from the driver as an
 * unlabelled failure with the statement in it. These cases are the reason the rule is written in
 * Zod as well: the editor needs the error attached to the category picker.
 */
describe("faqCreateInputSchema scope", () => {
  it("accepts a site-wide entry with a category", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: null,
      category: "booking",
      translations: [english],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a listing entry with no category", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: "ylst_1",
      category: null,
      translations: [english],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a site-wide entry with no category, on the category path", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: null,
      category: null,
      translations: [english],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["category"]);
  });

  it("rejects a locale the site does not serve", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: null,
      category: "booking",
      translations: [{ locale: "fr", question: "Comment réserver ?" }],
    });

    expect(result.success).toBe(false);
  });

  /* Two rows for one locale would make the same question resolve two ways on one page. */
  it("rejects a repeated locale", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: null,
      category: "booking",
      translations: [english, { locale: "en", question: "Something else" }],
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one translation", () => {
    const result = faqCreateInputSchema.safeParse({
      listingId: null,
      category: "booking",
      translations: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("faqUpdateInputSchema", () => {
  it("carries the same scope rule as create", () => {
    const result = faqUpdateInputSchema.safeParse({
      id: "faq_1",
      listingId: null,
      category: null,
      translations: [english],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["category"]);
  });

  it("trims the answer, so blank and absent cannot both be stored", () => {
    const result = faqUpdateInputSchema.safeParse({
      id: "faq_1",
      listingId: null,
      category: "booking",
      translations: [{ ...english, answer: "   " }],
    });

    expect(result.data?.translations[0]?.answer).toBe("");
  });
});

describe("faqListInputSchema", () => {
  it("opens on the site-wide list", () => {
    expect(faqListInputSchema.parse(undefined)).toMatchObject({ scope: "site", page: 1 });
  });

  it("refuses a listing scope with no listing, on the listingId path", () => {
    const result = faqListInputSchema.safeParse({ scope: "listing" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["listingId"]);
  });
});

describe("faqDeleteInputSchema", () => {
  /* The dangerous half of the pair, so it is never the one that happens by omission. */
  it("deletes one translation unless every locale is asked for", () => {
    expect(faqDeleteInputSchema.parse({ id: "faq_1" }).allLocales).toBe(false);
  });
});
