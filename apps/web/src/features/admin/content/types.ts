import { SITE_LOCALES } from "@yacht-charter/api/lib/locales";
import type { AdminClient } from "../shared/types";

/* Suggested-route authoring, inferred from the oRPC contract. */
export type RouteList = Awaited<ReturnType<AdminClient["route"]["list"]>>;
export type RouteRow = RouteList["items"][number];
export type RouteKind = RouteRow["kind"];
export type RouteStopRow = RouteRow["stops"][number];

export type GeographyOptions = Awaited<ReturnType<AdminClient["geography"]["options"]>>;
export type GeographyCountry = GeographyOptions["countries"][number];
export type GeographyRegion = GeographyOptions["regions"][number];
export type GeographyBase = GeographyOptions["bases"][number];

/** The five itinerary shapes the library is written against, in the order the picker lists them. */
export const ROUTE_KINDS: readonly RouteKind[] = [
  "seven_days",
  "fourteen_days",
  "family",
  "first_time_sailors",
  "active_sailing",
];

/* FAQ authoring, inferred from the oRPC contract. */
export type FaqList = Awaited<ReturnType<AdminClient["faq"]["list"]>>;
/** One question with every translation of it — the unit the whole screen deals in. */
export type FaqGroupRow = FaqList["items"][number];
export type FaqTranslation = FaqGroupRow["translations"][number];
export type FaqLocale = FaqTranslation["locale"];
export type FaqCategory = NonNullable<FaqGroupRow["category"]>;
export type FaqScope = "site" | "listing";
export type FaqGap = NonNullable<Parameters<AdminClient["faq"]["list"]>[0]>["gap"];
/** What the mutations report about dropping the public page's cached copy. */
export type FaqCacheResult = Awaited<ReturnType<AdminClient["faq"]["update"]>>["cache"];

/** The site's locales, in the order the editor's panes and the table's chips read them. */
export const FAQ_LOCALES: readonly FaqLocale[] = SITE_LOCALES;

/** `faq_category` in its declaration order, which is the order the public page renders. */
export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  "booking",
  "payment",
  "prices",
  "licences",
  "travel",
  "cancellation",
];

/* Curated facet order, inferred from the oRPC contract. */
export type PopularFacetList = Awaited<ReturnType<AdminClient["popularFacets"]["list"]>>;
export type PopularFacetValue = PopularFacetList["available"][number];
export type PopularFacetKind = PopularFacetList["kind"];
export type PopularFacetSurface = PopularFacetList["surface"];

/**
 * The curatable facet kinds, in the order the picker offers them.
 *
 * Countries and boat types first because they are the two the client actually asked for and the
 * two that show on the search page; equipment next because it decides which four amenities a
 * card carries. The rest are curatable and rarely curated.
 */
export const POPULAR_FACET_KINDS: readonly PopularFacetKind[] = [
  "country",
  "category",
  "equipment",
  "region",
  "marina",
  "model",
  "location",
  "crew",
  "sail_type",
];

export const POPULAR_FACET_SURFACES: readonly PopularFacetSurface[] = [
  "popular",
  "featured",
  "filter",
];

/**
 * The surfaces whose list is an order rather than a set.
 *
 * `filter` decides which values the search panel offers and nothing more, so the screen drops
 * its arrows and its position column: a control that moves a row and changes nothing reads as
 * one that is broken.
 */
export function popularFacetSurfaceIsOrdered(surface: PopularFacetSurface): boolean {
  return surface !== "filter";
}

/**
 * How one locale of one question stands.
 *
 * Three states, not two: the public read matches locale exactly and drops a blank answer, so a
 * translation that exists but answers nothing is as invisible as one that was never written —
 * and it is the one an editor cannot see without being told.
 */
export type FaqTranslationState = "answered" | "unanswered" | "missing";

export function faqTranslationState(group: FaqGroupRow, locale: FaqLocale): FaqTranslationState {
  if (group.missingLocales.includes(locale)) return "missing";
  return group.unansweredLocales.includes(locale) ? "unanswered" : "answered";
}

/** Nothing answered in any language: the entry is on the list and on nobody's page. */
export function faqIsUnpublished(group: FaqGroupRow): boolean {
  return group.translations.every((entry) => entry.answer === null);
}
