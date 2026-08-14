import { ORPCError } from "@orpc/server";
import {
  getListingByIdOrSlug,
  getListingDetailByIdOrSlug,
  listListingReviews,
  listListingsByIds,
  listSimilarListings,
} from "@yacht-charter/db/search";
import { z } from "zod";

import {
  listingDetailSchema,
  listingSummarySchema,
  listingsByIdsInputSchema,
  recordListingViewInputSchema,
} from "../contracts/catalog";
import { publicProcedure } from "../index";
import { withJsonBodyExample, withParameterExamples } from "./openapi-examples";
import { presentListingDetail, presentListingSummary } from "../presenters/listing";
import { recordListingView } from "../services/listing-view";

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
  byIds: publicProcedure
    .route({
      method: "POST",
      path: "/listings/by-ids",
      operationId: "listListingsByIds",
      summary: "List listing summaries by id",
      description:
        "Hydrates card-ready listing summaries for an explicit set of listing IDs, in the order requested. Backs the guest wishlist, which stores only IDs in the browser. IDs that no longer resolve to a published listing are dropped from the response rather than failing the call.",
      tags: ["Listings"],
      successDescription: "Listing summaries for the IDs that still resolve, in request order.",
      spec: withJsonBodyExample({
        listingIds: ["ylst_yacht-sunreef-60-celeste", "ylst_yacht-lagoon-42-aurora"],
      }),
    })
    .input(listingsByIdsInputSchema)
    .output(z.array(listingSummarySchema))
    .handler(async ({ context, input }) => {
      const docs = await listListingsByIds(context.db, input.listingIds);
      return docs.map((doc) => presentListingSummary(doc));
    }),
  recordView: publicProcedure
    .route({
      method: "POST",
      path: "/listings/{id}/views",
      operationId: "recordListingView",
      summary: "Record a listing view",
      description:
        "Counts one visitor against this listing for the current UTC day, which is what the detail page's 'people viewed today' reports. Repeat views by the same visitor on the same day are ignored, so the number is people rather than page loads. A signed-in caller is counted as their account; everyone else is counted by the anonymous id the browser sends, which the server hashes with the date before storing.",
      tags: ["Listings"],
      successDescription: "The view was counted, or was a repeat and already had been.",
      spec: withJsonBodyExample({
        id: "ylst_yacht-sunreef-60-celeste",
        viewer: "b4f1c0d2e3a45678",
      }),
    })
    .input(recordListingViewInputSchema)
    .output(z.object({ recorded: z.literal(true) }))
    .handler(async ({ context, input }) => {
      // Resolved rather than trusted: the id can be a slug, and this rejects an
      // unpublished or unknown listing here instead of at the foreign key.
      const listing = await getListingByIdOrSlug(context.db, input.id);
      if (!listing) {
        throw new ORPCError("NOT_FOUND", { message: "Listing not found" });
      }

      // A signed-in visitor counts once across their devices; the client-supplied
      // id is only the fallback for someone with no account.
      const viewer = context.session?.user.id ?? input.viewer;
      await recordListingView(context.db, { listingId: listing.listingId, viewer });

      return { recorded: true as const };
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
