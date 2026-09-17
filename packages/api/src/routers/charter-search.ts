import {
  listCatalogPages,
  listMapMarinas,
  listPopularRoutes,
  listPopularYachts,
  listSearchFacets,
  listSearchSuggestions,
} from "@yacht-charter/db/search";
import type { PriceBasis } from "@yacht-charter/db/search";
import { readFxSnapshot } from "@yacht-charter/db/fx/rates";
import { onCatalogRevalidate } from "@yacht-charter/providers/sync/revalidate";
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
import { fxSnapshotSchema } from "../contracts/catalog";
import {
  popularRoutesInputSchema,
  popularRoutesSchema,
  popularYachtsInputSchema,
  popularYachtsSchema,
} from "../contracts/popular-yachts";
import { emptyInputSchema } from "../contracts/primitives";
import type { Context } from "../context";
import { publicProcedure } from "../index";
import { getAmenityRanks } from "../services/amenity-ranks";
import { CATALOGUE_DEFAULT_BASIS, searchCharterResults } from "../services/charter-search";
import { getMarketplaceSettings } from "../services/marketplace-settings";
import { getPopularYachtsConfig } from "../services/popular-yachts-settings";
import { withParameterExamples } from "./openapi-examples";
import { compactFacets, createFacetsCache } from "../lib/facets-cache";
import { presentListingSummary } from "../presenters/listing";

/** A map viewport shows every match at once, so it is not paged like the results list. */
/**
 * Which figure the catalogue compares on for this request.
 *
 * Read per request rather than cached in the module: an admin who flips the switch expects the
 * next page to follow, and one settings row is not what makes a search slow. The same read
 * feeds the sort, the filter, the facet bounds and the card, which is what keeps a page from
 * disagreeing with itself.
 */
async function priceBasisFor(db: Context["db"]): Promise<PriceBasis> {
  const { catalogueShowsBasePrice } = await getMarketplaceSettings(db);
  return catalogueShowsBasePrice ? "base" : "all_in";
}

/**
 * The day the popular-yachts rotation is on, when the caller names no seed.
 *
 * A day rather than a request: the home page's read is cached, and a value that changed per
 * request would either be frozen into the cache with its first answer or refuse to prerender at
 * all. Bucketing the clock means the seed is stable inside a cache window and different across
 * days, which is what "periodically change the offer" asks for.
 */
const DAY_MS = 86_400_000;

function defaultSeed(): number {
  return Math.floor(Date.now() / DAY_MS);
}

const facetsCache = createFacetsCache();
onCatalogRevalidate(facetsCache.clear);

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
    .handler(({ context, input }) => searchCharterResults(context.db, input)),
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
    .handler(({ context, input }) =>
      /* Zod builds the parsed input in schema order, so its JSON is the same for two clients
         that sent the fields in a different order. */
      facetsCache.read(JSON.stringify(input), async () =>
        compactFacets(
          await listSearchFacets(context.db, {
            ...input,
            priceBasis: input.priceBasis ?? CATALOGUE_DEFAULT_BASIS,
          }),
        ),
      ),
    ),
  popularYachts: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/popular-yachts",
      operationId: "listPopularYachts",
      summary: "List the popular-yachts selection",
      description:
        "A spread of well-rated, recent, available boats drawn from the configured destinations (or the curated popular countries when none are configured), with at most one from any base or named place and a capped number from any country, filled towards a per-boat-type mix. The mix is a target rather than a guarantee: when the caps starve a type, the remaining places go to the next boats in the same ranking rather than leaving the slider short. Composition is configured on the admin settings screen. `seed` rotates the selection deterministically and defaults to the current day, so the answer is stable within a day and safe to cache.",
      tags: ["Charter Search"],
      successDescription: "The selected listings and the configuration they were selected under.",
      spec: withParameterExamples({ locale: "en", currency: "EUR" }),
    })
    .input(popularYachtsInputSchema)
    .output(popularYachtsSchema)
    .handler(async ({ context, input }) => {
      const [config, basis, amenityRanks] = await Promise.all([
        getPopularYachtsConfig(context.db),
        priceBasisFor(context.db),
        getAmenityRanks(context.db),
      ]);
      const items = await listPopularYachts(context.db, {
        config,
        seed: input.seed ?? defaultSeed(),
        locale: input.locale,
      });

      return {
        items: items.map((item) => presentListingSummary(item, basis, amenityRanks)),
        config,
      };
    }),
  popularRoutes: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/popular-routes",
      operationId: "listPopularRoutes",
      summary: "List the curated sailing routes",
      description:
        "The site-wide popular sailing routes in their curated order, each with its stops, the place it sails from and the country a card should filter the catalogue by. Copy is returned in the requested language, falling back to the route's own text where that language has none — a slider showing six cards in English and three in German would read as a broken page rather than as a translation gap. Unpublished routes are omitted.",
      tags: ["Charter Search"],
      successDescription: "The curated routes in rank order.",
      spec: withParameterExamples({ locale: "en", limit: 6 }),
    })
    .input(popularRoutesInputSchema)
    .output(popularRoutesSchema)
    .handler(async ({ context, input }) => ({
      routes: await listPopularRoutes(context.db, input),
    })),
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
      marinas: await listMapMarinas(context.db, {
        ...input,
        priceBasis: input.priceBasis ?? CATALOGUE_DEFAULT_BASIS,
      }),
    })),
  suggestions: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/suggestions",
      operationId: "suggestCharterSearchDestinations",
      summary: "Suggest destinations and bases",
      description:
        "Returns autocomplete suggestions for destination-style search input: countries, regions, cities and bases in the search read model, one per filter value, broadest first. Labels follow locale, and the query also matches the localized label.",
      tags: ["Charter Search"],
      successDescription: "Autocomplete suggestions matching the query.",
      spec: withParameterExamples({
        query: "Split",
      }),
    })
    .input(
      z.object({
        query: z.string().default(""),
        /* Mirrors apps/web/src/i18n/config.ts. Labels follow it, and a query matches them too. */
        locale: z.string().min(2).max(10).default("en"),
      }),
    )
    .output(z.array(suggestionSchema))
    .handler(({ context, input }) => listSearchSuggestions(context.db, input.query, input.locale)),
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
  fxRates: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/fx-rates",
      operationId: "getFxRates",
      summary: "Reference rates for displaying prices in another currency",
      description:
        "The ECB daily reference rates, quoted against the euro, with the day the source stamped them and how old this marketplace will let a rate get. Display only: a quote is settled in the currency it was priced in, and nothing converted here reaches a charge. The browser reads this because a page cached for every visitor cannot hold one visitor's currency.",
      tags: ["Charter Search"],
      successDescription: "Every stored rate, and the date the source published them.",
    })
    .input(emptyInputSchema)
    .output(fxSnapshotSchema)
    .handler(({ context }) => readFxSnapshot(context.db)),
  uiSettings: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/ui-settings",
      operationId: "getCharterSearchUiSettings",
      summary: "Read the search bar's configurable controls",
      description:
        "Which optional controls the yacht search bar shows, and which of the two prices the catalogue is currently comparing on. The free-text field is a testing aid that is off unless an admin turns it on; the search endpoint accepts `name` either way. The price basis is here so the slider label and any client-side ordering name the same figure the server sorted by.",
      tags: ["Charter Search"],
      successDescription: "The search controls currently enabled.",
    })
    .input(emptyInputSchema)
    .output(publicSearchSettingsSchema)
    .handler(async ({ context }) => {
      const settings = await getMarketplaceSettings(context.db);
      return {
        nameSearchEnabled: settings.nameSearchEnabled,
        catalogueShowsBasePrice: settings.catalogueShowsBasePrice,
        displayCurrencyEnabled: settings.displayCurrencyEnabled,
        displayCurrencyDefault: settings.displayCurrencyDefault,
        displayCurrencyByCountry: settings.displayCurrencyByCountry,
      };
    }),
};
