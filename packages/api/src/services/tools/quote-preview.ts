import { z } from "zod";

import { dateStringSchema } from "../../contracts/catalog";
import { idSchema, moneySchema } from "../../contracts/primitives";
import { nightsBetween, rangeStatus } from "../../lib/availability-rules";
import { combinedRangeStatus } from "../../lib/offer-availability";
import { loadAdjustmentsForListings, resolveAdjustedPrice } from "../pricing";
import { type ListingOffer, loadListingOffers } from "./listing-offers";
import { defineTool } from "./tool";

const WEEK_NIGHTS = 7;
/** The same guard the catalogue search puts on a charter length. */
const MAX_PREVIEW_NIGHTS = 365;

export const quotePreviewInputSchema = z
  .object({
    listingId: idSchema,
    checkIn: dateStringSchema,
    checkOut: dateStringSchema,
  })
  .refine((input) => input.checkIn < input.checkOut, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  })
  .refine((input) => nightsBetween(input.checkIn, input.checkOut) <= MAX_PREVIEW_NIGHTS, {
    message: `A charter may last at most ${MAX_PREVIEW_NIGHTS} nights`,
    path: ["checkOut"],
  });

export const quotePreviewOutputSchema = z.object({
  listingId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  nights: z.number().int(),
  verdict: z.enum([
    "bookable",
    "invalid-range",
    "checkin-day",
    "checkout-day",
    "too-short",
    "too-long",
    "occupied",
    "refused",
    "season-closed",
  ]),
  estimate: z
    .object({
      offerId: z.string(),
      /** `exact-period`: a rate stored for these exact dates. `weekly-rate`: a season's week. */
      source: z.enum(["exact-period", "weekly-rate"]),
      charterRate: moneySchema,
      /** After the marketplace's own price rules, which is the figure a quote starts from. */
      adjustedRate: moneySchema,
    })
    .nullable(),
  /** Always false: only a live quote is a price anyone can pay. */
  binding: z.literal(false),
});

type Candidate = {
  offerId: string;
  source: "exact-period" | "weekly-rate";
  amountMinor: number;
  currency: string;
};

type QuotePreview = z.output<typeof quotePreviewOutputSchema>;

function candidateFor(offer: ListingOffer, checkIn: string, checkOut: string): Candidate | null {
  const exact = offer.priced.find(
    (period) => period.startDate === checkIn && period.endDate === checkOut,
  );
  if (exact) {
    return { offerId: offer.offerId, source: "exact-period", ...pick(exact) };
  }

  // A weekly rate says nothing about a charter of another length, so only a week borrows it.
  if (nightsBetween(checkIn, checkOut) !== WEEK_NIGHTS) return null;
  const band = offer.priced
    .filter((period) => period.startDate <= checkIn && checkOut <= period.endDate)
    .sort((a, b) => a.priceMinor - b.priceMinor)[0];
  return band ? { offerId: offer.offerId, source: "weekly-rate", ...pick(band) } : null;
}

function pick(period: { priceMinor: number; currency: string }) {
  return { amountMinor: period.priceMinor, currency: period.currency };
}

/**
 * Read-only on purpose. The live quote path (`createQuote` in services/quote.ts) calls every
 * vendor and writes a quote row, offer attempts, learned refusals and learned extras, so a model
 * browsing prices through it would fill those tables and hit the vendors' rate limits. This reads
 * the synced calendar and rate list instead and runs the one pure pricing stage that applies to
 * a bare charter rate, the internal price rules. Obligatory fees, extras, discount codes and the
 * deposit split are not included; the live quote settles those.
 */
export const quotePreview = defineTool({
  name: "quotePreview",
  description:
    "Estimate the charter rate of one yacht for exact dates without creating a quote, hold or booking. Returns whether the period can be booked (and why not, e.g. wrong check-in weekday, too short, occupied) and, where a synced rate covers it, the rate before obligatory fees, extras and discounts. The estimate is not binding.",
  input: quotePreviewInputSchema,
  output: quotePreviewOutputSchema,
  run: async (ctx, input) => {
    const { listingId, checkIn, checkOut } = input;
    const { offers } = await loadListingOffers(ctx.db, { listingId, from: checkIn, to: checkOut });
    const { verdict } = combinedRangeStatus(checkIn, checkOut, offers);
    const nights = nightsBetween(checkIn, checkOut);
    const base: Omit<QuotePreview, "estimate"> = {
      listingId,
      checkIn,
      checkOut,
      nights,
      verdict,
      binding: false,
    };

    if (verdict !== "bookable") return { ...base, estimate: null };

    const candidates = offers
      .filter((offer) => rangeStatus(checkIn, checkOut, offer) === "bookable")
      .map((offer) => candidateFor(offer, checkIn, checkOut))
      .filter((candidate): candidate is Candidate => candidate !== null);
    // Amounts in two currencies do not compare, so the cheapest is looked for in the first one.
    const currency = candidates[0]?.currency;
    const best = candidates
      .filter((candidate) => candidate.currency === currency)
      .sort((a, b) => a.amountMinor - b.amountMinor)[0];

    if (!best) return { ...base, estimate: null };

    const rules = await loadAdjustmentsForListings(ctx.db, [listingId], checkIn);
    const adjusted = resolveAdjustedPrice(best.amountMinor, rules.get(listingId) ?? []);

    return {
      ...base,
      estimate: {
        offerId: best.offerId,
        source: best.source,
        charterRate: { amountMinor: best.amountMinor, currency: best.currency },
        adjustedRate: { amountMinor: adjusted.amountMinor, currency: best.currency },
      },
    };
  },
});
