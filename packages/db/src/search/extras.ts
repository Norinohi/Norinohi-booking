import { isSelectableExtraSource } from "@yacht-charter/env/providers";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import type { ListingPricedItem } from "./types";

/**
 * The optional extras this listing lists but no vendor will price, code to vendor name.
 *
 * The complement of `listSelectableExtraCodes` over the same catalogue rows. These are the ones
 * settled with the base: the booking flow lets a customer ask for them, carries the codes on the
 * quote, and writes their names into the booking's special requests. The vendor's own name is
 * what comes back rather than a translated label, because the person who reads that field works
 * at the base.
 */
export async function listRequestableExtras(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  listingOfferId?: string | null,
): Promise<Map<string, string>> {
  const rows = await db.execute<{
    source: string;
    kind: string;
    externalId: string;
    name: string;
  }>(sql`
    select source, kind, external_id as "externalId", name
    from provider_extra_catalogue
    where obligatory = false
      and ${listingOfferId ? sql`listing_offer_id = ${listingOfferId}` : sql`listing_id = ${listingId}`}
  `);

  return new Map(
    rows.rows
      .filter((row) => !isSelectableExtra(row.source, row.kind))
      .map((row) => [`${row.kind}:${row.externalId}`, row.name]),
  );
}

/** A requestable extra's catalogue price, which is what its quote line is computed from. */
export type RequestableExtraPrice = {
  name: string;
  priceMinor: number;
  priceCurrency: string | null;
  priceMeasure: string | null;
  /** A share of the charter rather than money: 0.35 is 35%. */
  percentage: number | null;
  /** INCLUDED_IN_PRICE is covered by the charter and charged nowhere. */
  included: boolean;
};

/**
 * The prices behind `listRequestableExtras`, by canonical code.
 *
 * No vendor will price these on the offer, so the catalogue's figure is the only one there is.
 * It is the operator's own published rate for the item, which is what the base bills on arrival.
 */
export async function listRequestableExtraPrices(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  listingOfferId?: string | null,
): Promise<Map<string, RequestableExtraPrice>> {
  const rows = await db.execute<{
    source: string;
    kind: string;
    externalId: string;
    name: string;
    priceMinor: number | null;
    priceCurrency: string | null;
    priceMeasure: string | null;
    calculationType: string | null;
    percentage: string | null;
  }>(sql`
    select source, kind, external_id as "externalId", name,
      price_minor as "priceMinor", price_currency as "priceCurrency",
      price_measure as "priceMeasure", calculation_type as "calculationType", percentage
    from provider_extra_catalogue
    where obligatory = false
      and ${listingOfferId ? sql`listing_offer_id = ${listingOfferId}` : sql`listing_id = ${listingId}`}
  `);

  return new Map(
    rows.rows
      .filter((row) => !isSelectableExtra(row.source, row.kind))
      .map((row) => [
        `${row.kind}:${row.externalId}`,
        {
          name: row.name,
          priceMinor: row.priceMinor ?? 0,
          priceCurrency: row.priceCurrency,
          priceMeasure: row.priceMeasure,
          percentage: row.percentage === null ? null : Number(row.percentage),
          included: row.calculationType === "INCLUDED_IN_PRICE",
        },
      ]),
  );
}

/**
 * The optional extras this listing will actually price, as canonical codes.
 *
 * The quote path checks a selection against this rather than trusting the client:
 * an unrecognised code used to be persisted onto the quote and then dropped by the
 * adapter, which billed nothing and told nobody.
 */
export async function listSelectableExtraCodes(
  db: NodePgDatabase<typeof schema>,
  listingId: string,
  listingOfferId?: string | null,
): Promise<Set<string>> {
  /*
   * Narrowed to one offer where the caller knows which vendor it is quoting. An extra code
   * belongs to the provider that published it, so across a merged listing the union would
   * accept a code from the vendor that is not selling this charter, persist it onto the quote,
   * and have the adapter drop it: billed nothing, told nobody. Without an offer this stays the
   * listing-wide set, which is exactly right while a listing has one.
   */
  const rows = await db.execute<{ source: string; kind: string; externalId: string }>(sql`
    select source, kind, external_id as "externalId"
    from provider_extra_catalogue
    where obligatory = false
      and ${listingOfferId ? sql`listing_offer_id = ${listingOfferId}` : sql`listing_id = ${listingId}`}
  `);

  return new Set(
    rows.rows
      .filter((row) => isSelectableExtra(row.source, row.kind))
      .map((row) => `${row.kind}:${row.externalId}`),
  );
}

/**
 * Whether the booking flow may offer this extra as a priced choice.
 *
 * This is provider knowledge sitting in the read model because the dependency runs
 * the other way: `packages/providers` imports this package. The per-provider answer,
 * and why each provider gives it, is `selectableExtraKinds` in the provider registry.
 */
export function isSelectableExtra(source: string, kind: string): boolean {
  return isSelectableExtraSource(source, kind);
}

/**
 * One row per fee, not one per variant the provider keys separately.
 *
 * Booking Manager publishes an obligatory extra per base pair and boat class, so this hull
 * carries three "Boat Cleaning" ids at 150/155/160 and two "One Way Fee" ids at 155/185.
 * Exactly one of each is ever charged, and which one is not decided until the dates and the
 * route are - the booking sidebar shows that, priced, off the live offer. Listing all five
 * side by side read as five separate charges totalling 805 euro against a 809 euro boat.
 *
 * Folded on the vendor's own name because that is the only thing the variants share: the vendor
 * gives them distinct ids and no grouping key of its own. Deliberately not the translated label:
 * each variant is a separate dictionary entry, and one of them missing a locale would split a
 * fee back into the several rows this exists to merge.
 */
/**
 * The discriminators a vendor puts on one fee to publish it once per charter year and once per
 * charter length. Stripped from the fold key so the variants meet; everything else is kept.
 *
 * Deliberately not parentheticals, and not a bare trailing number. A tourist tax filed as
 * "(Adults)", "(kids 12- 18 years old)" and "(kids up to 12 years)" is three real charges on one
 * booking, and "Gas (First 31.7) 2" through "8" is a ladder nobody here can read. Folding those
 * would hide money rather than stop double-counting it.
 */
const FEE_VARIANT_TOKENS: RegExp[] = [
  /\b20\d{2}\b/g,
  /\b\d{2}\s*\/\s*\d{2}\b/g,
  /\b\d+\s*(?:weeks?|days?|nights?)\b/gi,
  /\b(?:one|two|three)\s+(?:weeks?|days?|nights?)\b/gi,
];

function withoutVariantTokens(label: string): string {
  return FEE_VARIANT_TOKENS.reduce((text, token) => text.replace(token, " "), label)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * What two obligatory lines have to share to be one fee.
 *
 * Punctuation and case go too, which is what lets "Transit log" meet "Transitlog" — the same
 * 250 euro charge filed twice by one operator.
 */
export function feeVariantKey(label: string): string {
  return withoutVariantTokens(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function foldFeeVariants(
  items: (Parameters<typeof pricedItem>[0] & { sourceLabel: string })[],
  fallbackCurrency: string | null,
): ListingPricedItem[] {
  const byLabel = new Map<string, ListingPricedItem>();
  /* Kept per group so a fold across differing names can drop the discriminator from the label
     it shows, while a group whose names already matched keeps the vendor's wording untouched. */
  const sourceLabels = new Map<string, Set<string>>();

  for (const item of items) {
    const key = feeVariantKey(item.sourceLabel);
    const next = pricedItem(item, fallbackCurrency);
    const names = sourceLabels.get(key) ?? new Set<string>();
    names.add(item.sourceLabel);
    sourceLabels.set(key, names);

    const seen = byLabel.get(key);
    if (!seen) {
      byLabel.set(key, next);
      continue;
    }

    const low = Math.min(seen.price.amountMinor, next.price.amountMinor);
    const high = Math.max(seen.priceToMinor ?? seen.price.amountMinor, next.price.amountMinor);
    const cheaper = seen.price.amountMinor <= next.price.amountMinor ? seen : next;
    const dearer = cheaper === seen ? next : seen;
    byLabel.set(key, {
      ...cheaper,
      price: { ...seen.price, amountMinor: low },
      priceToMinor: high > low ? high : null,
      // Variants that disagree on where the fee is collected say nothing together.
      payableInBase: seen.payableInBase === next.payableInBase ? seen.payableInBase : null,
      // Conditional only where every variant is; one unconditional variant is always charged.
      oneWayOnly: seen.oneWayOnly && next.oneWayOnly,
      /* Included only where every variant is, for the same reason: a variant the operator
         charges for is a charge. Read off the dearer row when the cheaper one is included,
         since the spread above would otherwise hand the whole fee that variant's silence. */
      pricingType: cheaper.pricingType === "included" ? dearer.pricingType : cheaper.pricingType,
    });
  }

  /*
   * A merged group is named without the discriminator it merged over: keeping "Transit Log 2026
   * 1 week" on a 360-440 row names one of the three variants and prices all of them. Only where
   * the vendor's own names actually differed — a group it filed under one name keeps that name,
   * and a fee that never had a variant keeps its year.
   */
  return [...byLabel.entries()].map(([key, item]) => {
    const names = sourceLabels.get(key);
    if (!names || names.size < 2) return item;
    const cleaned = withoutVariantTokens(item.label);
    return cleaned.length > 0 ? { ...item, label: cleaned } : item;
  });
}

export function pricedItem(
  item: {
    code: string;
    label: string;
    priceMinor: number | null;
    priceCurrency: string | null;
    priceMeasure?: string | null;
    calculationType?: string | null;
    percentage?: string | null;
    payableInBase?: boolean | null;
    oneWayOnly?: boolean | null;
  },
  fallbackCurrency: string | null,
): ListingPricedItem {
  return {
    code: item.code,
    label: item.label,
    price: {
      amountMinor: item.priceMinor ?? 0,
      currency: item.priceCurrency ?? fallbackCurrency ?? "EUR",
    },
    priceToMinor: null,
    priceMeasure: item.priceMeasure ?? null,
    /* A fee the operator states as a share of the charter: 0.35 is 35%. It has no money on the
       catalogue row at all, so a card that showed only `price` called it free. */
    percentage:
      item.percentage === null || item.percentage === undefined ? null : Number(item.percentage),
    payableInBase: item.payableInBase ?? null,
    oneWayOnly: item.oneWayOnly ?? false,
    pricingType: pricingTypeOf(item.calculationType),
  };
}

/*
 * Most extras are settled with the base on arrival, but not all: the vendor also
 * sells some up front, and this used to answer "pay at check-in" for every one of
 * them. A quote then charged the customer today for a line the listing had just
 * promised them at the marina.
 *
 * The offer is the authority where there is one — it and the catalogue genuinely
 * disagree on individual extras — so this only answers for an extra no offer
 * covers. `per_booking` here carries no measure, only "not settled at the base";
 * what the price is per is `priceMeasure`'s job.
 *
 * INCLUDED_IN_PRICE is settled nowhere, because it is not a charge: the operator has priced
 * the service inside the charter itself and NauSYS keeps sending the list value anyway. The
 * quote drops that figure to zero, so answering "pay at check-in" here put a fee on the
 * listing page that the sidebar beside it was not charging.
 */
function pricingTypeOf(
  calculationType: string | null | undefined,
): ListingPricedItem["pricingType"] {
  if (calculationType === "INCLUDED_IN_PRICE") return "included";
  return calculationType === "ADVANCE_PAYMENT" ? "per_booking" : "pay_at_check_in";
}
