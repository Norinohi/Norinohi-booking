import { ORPCError } from "@orpc/server";
import {
  getListingDetailByIdOrSlug,
  listListingReviews,
  listSimilarListings,
} from "@yacht-charter/db/search";
import { z } from "zod";

import { listingDetailSchema, listingSummarySchema } from "../contracts/catalog";
import { publicProcedure } from "../index";
import { withParameterExamples } from "./openapi-examples";
import { presentListingDetail, presentListingSummary } from "../presenters/listing";

const idInputSchema = z.object({ id: z.string() });
const listingIdInputSchema = z.object({ listingId: z.string() });

export const listingsRouter = {
  get: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{id}",
      operationId: "getListing",
      summary: "Get a listing by id or slug",
      description:
        "Returns the customer-facing listing summary for a canonical yacht. The id path value can be either the listing ID or its slug.",
      tags: ["Listings"],
      successDescription:
        "Rich listing detail with summary, specs, media, amenities, extras, policies, route, reviews, FAQ, and popular yachts.",
      spec: withParameterExamples({
        id: "ylst_yacht-sunreef-60-celeste",
      }),
    })
    .input(idInputSchema)
    .output(listingDetailSchema)
    .handler(async ({ context, input }) => {
      const listing = await getListingDetailByIdOrSlug(context.db, input.id);
      if (!listing) {
        throw new ORPCError("NOT_FOUND", { message: "Listing not found" });
      }
      return presentListingDetail(listing);
    }),
  reviews: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/reviews",
      operationId: "listListingReviews",
      summary: "List listing reviews",
      description:
        "Returns marketplace-owned review content for a listing. Reviews are demo/local content for the current milestone and are ordered newest first.",
      tags: ["Listings"],
      successDescription: "Reviews attached to the requested listing.",
      spec: withParameterExamples({
        listingId: "ylst_yacht-sunreef-60-celeste",
      }),
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
    .handler(({ context, input }) => listListingReviews(context.db, input.listingId)),
  similar: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/similar",
      operationId: "listSimilarListings",
      summary: "List similar listings",
      description:
        "Returns a small set of related listings based on category, country, or region. Use this for detail-page recommendations.",
      tags: ["Listings"],
      successDescription: "Similar yacht listing summaries.",
      spec: withParameterExamples({
        listingId: "ylst_yacht-sunreef-60-celeste",
      }),
    })
    .input(listingIdInputSchema)
    .output(z.array(listingSummarySchema))
    .handler(async ({ context, input }) => {
      const listings = await listSimilarListings(context.db, input.listingId);
      return listings.map((listing) => presentListingSummary(listing));
    }),
};
