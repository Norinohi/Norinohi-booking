import { ORPCError } from "@orpc/server";
import { db } from "@yacht-charter/db";
import {
  getListingByIdOrSlug,
  listListingReviews,
  listSimilarListings,
} from "@yacht-charter/db/search";
import { z } from "zod";

import { listingSummarySchema } from "../contracts/catalog";
import { publicProcedure } from "../index";
import { presentListingSummary } from "./presenters";

const idInputSchema = z.object({ id: z.string() });
const listingIdInputSchema = z.object({ listingId: z.string() });

export const listingsRouter = {
  get: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{id}",
      summary: "Get a listing by id or slug",
    })
    .input(idInputSchema)
    .output(listingSummarySchema)
    .handler(async ({ input }) => {
      const listing = await getListingByIdOrSlug(db, input.id);
      if (!listing) {
        throw new ORPCError("NOT_FOUND", { message: "Listing not found" });
      }
      return presentListingSummary(listing);
    }),
  reviews: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/reviews",
      summary: "List listing reviews",
    })
    .input(listingIdInputSchema)
    .output(
      z.array(
        z.object({
          id: z.string(),
          rating: z.number(),
          author: z.string(),
          body: z.string(),
        }),
      ),
    )
    .handler(({ input }) => listListingReviews(db, input.listingId)),
  similar: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/similar",
      summary: "List similar listings",
    })
    .input(listingIdInputSchema)
    .output(z.array(listingSummarySchema))
    .handler(async ({ input }) => {
      const listings = await listSimilarListings(db, input.listingId);
      return listings.map(presentListingSummary);
    }),
};
