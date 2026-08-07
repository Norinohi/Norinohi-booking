import { listSearchFacets, listSearchSuggestions, searchListings } from "@yacht-charter/db/search";
import { z } from "zod";

import {
  facetsSchema,
  listingSearchInputSchema,
  mapResultSchema,
  partialListingSearchInputSchema,
  searchResultSchema,
  suggestionSchema,
} from "../contracts/catalog";
import { publicProcedure } from "../index";
import { withParameterExamples } from "./openapi-examples";
import { effectivePeriod } from "../lib/dates";
import { presentListingSummary } from "../presenters/listing";

export const charterSearchRouter = {
  results: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/results",
      operationId: "searchCharterListings",
      summary: "Search available yacht listings",
      description:
        "Returns listing cards from the database-backed search read model. Page pagination is the default for the results pager and returns total/range metadata. Supplying cursor switches to forward cursor pagination.",
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
    .handler(async ({ context, input }) => {
      const results = await searchListings(context.db, input);
      const period = effectivePeriod(input);
      return {
        items: results.items.map((item) => ({
          listing: presentListingSummary(item, period),
          checkIn: period.checkIn ?? item.availableFrom,
          checkOut: period.checkOut ?? item.availableTo,
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
  mapMarkers: publicProcedure
    .route({
      method: "GET",
      path: "/charter-search/map-markers",
      operationId: "listCharterSearchMapMarkers",
      summary: "List search map markers",
      description:
        "Returns geo-positioned listing markers from the search read model for the current filter set. Markers include listing identity, coordinates, price hint, and a card-ready listing summary for map popups and side panels.",
      tags: ["Charter Search"],
      successDescription: "Map markers for listings matching the supplied filters.",
      spec: withParameterExamples({
        destination: "Croatia",
        currency: "EUR",
        limit: 50,
      }),
    })
    .input(partialListingSearchInputSchema)
    .output(mapResultSchema)
    .handler(async ({ context, input }) => {
      const results = await searchListings(context.db, {
        ...input,
        limit: input.limit ?? 500,
        page: undefined,
      });
      const period = effectivePeriod(input);
      return {
        markers: results.items
          .filter((item) => item.lat !== null && item.lng !== null)
          .map((item) => ({
            listingId: item.listingId,
            slug: item.slug,
            title: item.title,
            lat: item.lat ?? 0,
            lng: item.lng ?? 0,
            priceFromMinor: item.priceFromMinor,
            currency: item.currency,
            listing: presentListingSummary(item, period),
          })),
      };
    }),
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
};
