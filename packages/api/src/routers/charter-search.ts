import { db } from "@yacht-charter/db";
import {
  listMapMarkers,
  listSearchFacets,
  listSearchSuggestions,
  searchListings,
} from "@yacht-charter/db/search";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  facetsSchema,
  listingSearchInputSchema,
  mapResultSchema,
  searchResultSchema,
  suggestionSchema,
} from "../contracts/catalog";
import { publicProcedure } from "../index";
import { withParameterExamples } from "./openapi-examples";
import { presentListingSummary } from "./presenters";

export const charterSearchRouter = {
  results: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/results",
      operationId: "searchCharterListings",
      summary: "Search available yacht listings",
      description:
        "Returns listing cards from the database-backed search read model. Use page/pageSize for direct page jumps in the results pager, or cursor/limit for forward cursor pagination. Do not send page and cursor together.",
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
        page: 1,
        pageSize: 10,
        sort: "recommended",
      }),
    })
    .input(listingSearchInputSchema)
    .output(searchResultSchema)
    .handler(async ({ input }) => {
      if (input.cursor && input.page) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Use either cursor pagination or page pagination, not both.",
        });
      }

      const results = await searchListings(db, input);
      return {
        items: results.items.map((item) => ({
          listing: presentListingSummary(item),
          checkIn: item.availableFrom,
          checkOut: item.availableTo,
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
    .input(listingSearchInputSchema.partial().default({}))
    .output(facetsSchema)
    .handler(({ input }) => listSearchFacets(db, input)),
  mapMarkers: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/map-markers",
      operationId: "listCharterSearchMapMarkers",
      summary: "List search map markers",
      description:
        "Returns geo-positioned listing markers from the search read model for the current filter set. Markers include listing identity, display title, coordinates, and price hint.",
      tags: ["Charter Search"],
      successDescription: "Map markers for listings matching the supplied filters.",
      spec: withParameterExamples({
        destination: "Croatia",
        currency: "EUR",
        limit: 50,
      }),
    })
    .input(listingSearchInputSchema.partial().default({}))
    .output(mapResultSchema)
    .handler(async ({ input }) => ({ markers: await listMapMarkers(db, input) })),
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
    .handler(({ input }) => listSearchSuggestions(db, input.query)),
};
