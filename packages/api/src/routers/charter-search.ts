import {
  listCatalogPages,
  listMapMarinas,
  listSearchFacets,
  listSearchSuggestions,
  searchListings,
} from "@yacht-charter/db/search";
import type { ListingSearchDoc } from "@yacht-charter/db/search";
import { z } from "zod";

import {
  facetsSchema,
  catalogPageSchema,
  listingSearchInputSchema,
  mapMarinaResultSchema,
  partialListingSearchInputSchema,
  searchResultSchema,
  suggestionSchema,
} from "../contracts/catalog";
import { publicSearchSettingsSchema } from "../contracts/admin";
import { emptyInputSchema } from "../contracts/primitives";
import { publicProcedure } from "../index";
import { getMarketplaceSettings } from "../services/marketplace-settings";
import { withParameterExamples } from "./openapi-examples";
import { type CharterPeriod, effectivePeriod } from "../lib/dates";
import { bookablePeriodOf, presentListingSummary } from "../presenters/listing";

/*
 * The dates a card carries, and whether they are the ones asked for.
 *
 * The searched period when this listing would actually sell it. When it would not -- free that
 * week, but Saturday to Saturday -- the card carries the boat's own first sellable charter
 * instead. Repeating the visitor's dates there is what sent them to a detail page that refused
 * the period and fell back to "Select dates" with nothing said about why.
 *
 * `bookablePeriodOf` is also the period `priceFrom` and `periodDays` already describe, so the
 * swap leaves the card internally consistent rather than pairing one charter's dates with
 * another's rate.
 */
function periodFor(item: ListingSearchDoc, period: CharterPeriod, startDate: string | undefined) {
  if (period.checkIn !== undefined && item.sellsRequestedPeriod) {
    return {
      checkIn: period.checkIn,
      checkOut: period.checkOut ?? null,
      periodIsAlternative: false,
    };
  }

  /*
   * A start date with no duration states one end and not the other, so `effectivePeriod` calls
   * that no period at all and the card fell back to the listing's own first charter -- which is
   * free to begin before the day that was actually asked for. Searching "from 16 September"
   * and being shown a week starting the 12th is the one answer the question rules out.
   *
   * `nearestCheckIn` is walked forward from the searched day, so it can only ever land on or
   * after it, and it is what the filter admitted this listing for.
   */
  if (period.checkIn === undefined && startDate === undefined) {
    return { checkIn: null, checkOut: null, periodIsAlternative: false };
  }

  /*
   * The charter nearest the dates asked for, and only then the listing's own first one. The
   * fallback is what a boat with nothing sellable left near the search gets, and it is far
   * enough from the question to be worth avoiding: a September search was answered with a
   * November week because `bookablePeriodOf` is the first charter in the whole horizon.
   */
  const nearest =
    item.nearestCheckIn && item.nearestCheckOut
      ? { checkIn: item.nearestCheckIn, checkOut: item.nearestCheckOut }
      : bookablePeriodOf(item);

  /* No sellable charter to offer instead: say nothing rather than name a refused period. */
  if (!nearest) return { checkIn: null, checkOut: null, periodIsAlternative: false };

  /*
   * "Alternative" only where a period was actually named. A start date alone is answered, not
   * contradicted: the charter starts on or after the day asked for, which is what was wanted.
   */
  return {
    checkIn: nearest.checkIn,
    checkOut: nearest.checkOut,
    periodIsAlternative: period.checkIn !== undefined,
  };
}

/*
 * The card, with its price captioned for the charter the card actually names.
 *
 * `priceFrom` is the vendor's confirmed figure for one exact week -- the listing's own bookable
 * period -- and nothing here can reprice another one: the published rate list is the pre-discount
 * number both vendors sell below (EUR 5,111 against a quote of EUR 3,581.60 on one week), and no
 * arithmetic turns a week into a charter of another length. So when the card names a different
 * charter, the figure stops being that week's price and becomes what it honestly is, a floor.
 *
 * Measured before this: of 30 dated cards, 7 printed a definite price for a week they were not
 * quoted for, the worst off by EUR 8,332.
 */
function pricedForShownPeriod(item: ListingSearchDoc, shown: { checkIn: string | null }) {
  const listing = presentListingSummary(item);
  if (listing.priceIsFrom || shown.checkIn === null) return listing;

  /* No dates on the card means the undated fallback, which is the priced period itself. */
  const priced = bookablePeriodOf(item);
  if (priced && priced.checkIn === shown.checkIn) return listing;

  return { ...listing, priceIsFrom: true };
}

/** A map viewport shows every match at once, so it is not paged like the results list. */
export const charterSearchRouter = {
  results: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/results",
      operationId: "searchCharterListings",
      summary: "Search available yacht listings",
      description:
        "Returns listing cards from the database-backed search read model. Page pagination is the default for the results pager and returns total/range metadata. Supplying cursor switches to forward cursor pagination. Card labels (category, crew, sail type, country, region, location, marina, amenities) follow locale, falling back to English where a translation is missing.",
      tags: ["Charter Search"],
      successDescription:
        "Matching yacht listings with either page pagination metadata or a next cursor.",
      spec: withParameterExamples({
        destination: "Croatia",
        checkIn: "2026-07-04",
        checkOut: "2026-07-11",
        guests: 6,
        category: "Catamaran",
        minCabins: 4,
        maxPriceMinor: 1_200_000,
        currency: "EUR",
        locale: "uk",
        page: 1,
        pageSize: 10,
        sort: "recommended",
      }),
    })
    .input(listingSearchInputSchema)
    .output(searchResultSchema)
    .handler(async ({ context, input }) => {
      const results = await searchListings(context.db, input);
      const period = effectivePeriod(input);
      return {
        items: results.items.map((item) => ({
          listing: pricedForShownPeriod(item, periodFor(item, period, input.startDate)),
          /*
           * The searched charter, or nothing. These used to fall back to the listing's
           * `available_from`/`available_to`, which is the outer envelope of every free slot
           * in the horizon -- so an undated search captioned each card with a year-long
           * "charter" ("19 Aug 2026 -> 19 Aug 2027") beside a weekly rate. That envelope is
           * not even a bookable stretch, since it spans the gaps between slots. The card
           * already renders without dates on the catalogue pages.
           */
          ...periodFor(item, period, input.startDate),
        })),
        nextCursor: results.nextCursor,
        pagination: results.pagination,
      };
    }),
  facets: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/facets",
      operationId: "listCharterSearchFacets",
      summary: "List search filter facets",
      description:
        "Returns dynamic filter values for the current search constraints, including destinations, yacht categories, amenities, and the matching price range.",
      tags: ["Charter Search"],
      successDescription: "Facet values and price range for the supplied search filters.",
      spec: withParameterExamples({
        destination: "Croatia",
        guests: 6,
        currency: "EUR",
        sort: "recommended",
      }),
    })
    .input(partialListingSearchInputSchema)
    .output(facetsSchema)
    .handler(({ context, input }) => listSearchFacets(context.db, input)),
  mapMarinas: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/map-marinas",
      operationId: "listCharterSearchMapMarinas",
      summary: "List search map marinas",
      description:
        "Returns the marinas the current filter set has boats at, one entry each, with the number of matching boats and the cheapest price among them. This is what the search map draws: boats share their base's coordinate, so a marker per boat is a stack of pins on one point and an answer that grows with the catalogue. Cards for a marina's boats come from the results endpoint when one is opened.",
      tags: ["Charter Search"],
      successDescription: "Marinas holding boats that match the supplied search filters.",
      spec: withParameterExamples({
        destination: "Croatia",
        currency: "EUR",
        locale: "uk",
      }),
    })
    .input(partialListingSearchInputSchema)
    .output(mapMarinaResultSchema)
    .handler(async ({ context, input }) => ({
      marinas: await listMapMarinas(context.db, input),
    })),
  suggestions: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/suggestions",
      operationId: "suggestCharterSearchDestinations",
      summary: "Suggest destinations and bases",
      description:
        "Returns autocomplete suggestions for destination-style search input. Suggestions are sourced from countries, regions, locations, and bases in the search read model.",
      tags: ["Charter Search"],
      successDescription: "Autocomplete suggestions matching the query.",
      spec: withParameterExamples({
        query: "Split",
      }),
    })
    .input(z.object({ query: z.string().default("") }))
    .output(z.array(suggestionSchema))
    .handler(({ context, input }) => listSearchSuggestions(context.db, input.query)),
  catalogPages: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/catalog-pages",
      operationId: "listCharterCatalogPages",
      summary: "List the generated catalog pages",
      description:
        "Every destination, type and model combination with enough listings behind it to deserve its own page. One source for the routes that are built, the sitemap that advertises them and the filter each one applies, so the three can never disagree. Combinations below the threshold are absent rather than empty.",
      tags: ["Charter Search"],
      successDescription:
        "Catalog pages with their path segments, filter values and listing counts.",
    })
    .input(z.object({ locale: z.string().min(2).max(10).default("en") }))
    .output(z.array(catalogPageSchema))
    .handler(({ context, input }) => listCatalogPages(context.db, { locale: input.locale })),
  uiSettings: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/ui-settings",
      operationId: "getCharterSearchUiSettings",
      summary: "Read the search bar's configurable controls",
      description:
        "Which optional controls the yacht search bar shows. Only the free-text field is configurable today, and it is a testing aid that is off unless an admin turns it on — the search endpoint accepts `name` either way.",
      tags: ["Charter Search"],
      successDescription: "The search controls currently enabled.",
    })
    .input(emptyInputSchema)
    .output(publicSearchSettingsSchema)
    .handler(async ({ context }) => {
      const settings = await getMarketplaceSettings(context.db);
      return { nameSearchEnabled: settings.nameSearchEnabled };
    }),
};
