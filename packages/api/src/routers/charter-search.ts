import {
  listCatalogPages,
  listMapMarinas,
  listSearchFacets,
  listSearchSuggestions,
  searchListings,
} from "@yacht-charter/db/search";
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
import { publicProcedure } from "../index";
import { withParameterExamples } from "./openapi-examples";
import { effectivePeriod } from "../lib/dates";
import { presentListingSummary } from "../presenters/listing";

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
          listing: presentListingSummary(item),
          /*
           * The searched charter, or nothing. These used to fall back to the listing's
           * `available_from`/`available_to`, which is the outer envelope of every free slot
           * in the horizon -- so an undated search captioned each card with a year-long
           * "charter" ("19 Aug 2026 -> 19 Aug 2027") beside a weekly rate. That envelope is
           * not even a bookable stretch, since it spans the gaps between slots. The card
           * already renders without dates on the catalogue pages.
           */
          checkIn: period.checkIn ?? null,
          checkOut: period.checkOut ?? null,
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
};
