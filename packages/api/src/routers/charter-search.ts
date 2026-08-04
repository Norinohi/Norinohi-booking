import { db } from "@yacht-charter/db";
import {
  listMapMarkers,
  listSearchFacets,
  listSearchSuggestions,
  searchListings,
} from "@yacht-charter/db/search";
import { z } from "zod";

import {
  facetsSchema,
  listingSearchInputSchema,
  mapResultSchema,
  searchResultSchema,
  suggestionSchema,
} from "../contracts/catalog";
import { publicProcedure } from "../index";
import { presentListingSummary } from "./presenters";

export const charterSearchRouter = {
  results: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/results",
      summary: "Search available yacht listings",
    })
    .input(listingSearchInputSchema)
    .output(searchResultSchema)
    .handler(async ({ input }) => {
      const results = await searchListings(db, input);
      return {
        items: results.items.map((item) => ({
          listing: presentListingSummary(item),
          checkIn: item.availableFrom,
          checkOut: item.availableTo,
        })),
        nextCursor: results.nextCursor,
      };
    }),
  facets: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/facets",
      summary: "List search filter facets",
    })
    .input(listingSearchInputSchema.partial().default({}))
    .output(facetsSchema)
    .handler(({ input }) => listSearchFacets(db, input)),
  mapMarkers: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/map-markers",
      summary: "List search map markers",
    })
    .input(listingSearchInputSchema.partial().default({}))
    .output(mapResultSchema)
    .handler(async ({ input }) => ({ markers: await listMapMarkers(db, input) })),
  suggestions: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/suggestions",
      summary: "Suggest destinations and bases",
    })
    .input(z.object({ query: z.string().default("") }))
    .output(z.array(suggestionSchema))
    .handler(({ input }) => listSearchSuggestions(db, input.query)),
};
