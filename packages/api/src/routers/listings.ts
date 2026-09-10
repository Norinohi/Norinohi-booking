import { ORPCError } from "@orpc/server";
import {
  getListingByIdOrSlug,
  getListingDetailByIdOrSlug,
  getMergedListingTarget,
  listListingReviews,
  listListingsByIds,
  listSimilarListings,
  type PriceBasis,
} from "@yacht-charter/db/search";
import { z } from "zod";

import {
  listingDetailSchema,
  listingSummarySchema,
  listingsByIdsInputSchema,
  recordListingViewInputSchema,
} from "../contracts/catalog";
import type { Context } from "../context";
import { publicProcedure } from "../index";
import { withJsonBodyExample, withParameterExamples } from "./openapi-examples";
import { getAmenityRanks } from "../services/amenity-ranks";
import { presentListingDetail, presentListingSummary } from "../presenters/listing";
import { getMarketplaceSettings } from "../services/marketplace-settings";
import { recordListingView } from "../services/listing-view";

const idInputSchema = z.object({
  id: z.string(),
  /* Mirrors listingSearchInputSchema, so both reads localize labels on the same rules. */
  locale: z.string().min(2).max(10).default("en"),
});
const listingIdInputSchema = z.object({ listingId: z.string() });

/**
 * Which price the detail page and the cards beside it lead with.
 *
 * The same read the catalogue does, so a listing's own page and the card that led here quote
 * the same figure. Nothing here caches it: one settings row per request is not what makes a
 * page slow, and a stale copy would be a page arguing with the one before it.
 */
async function catalogueBasis(db: Context["db"]): Promise<PriceBasis> {
  const { catalogueShowsBasePrice } = await getMarketplaceSettings(db);
  return catalogueShowsBasePrice ? "base" : "all_in";
}

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
      const listing = await getListingDetailByIdOrSlug(context.db, input.id, input.locale);
      if (!listing) {
        throw new ORPCError("NOT_FOUND", { message: "Listing not found" });
      }
      return presentListingDetail(listing, await catalogueBasis(context.db));
    }),
  redirectTarget: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{id}/redirect-target",
      operationId: "getListingRedirectTarget",
      summary: "Where a merged listing's old URL now leads",
      description:
        "Resolves the URL of the listing a merged duplicate was folded into, so the old address can send visitors on rather than 404. Returns null for an id or slug that is simply unknown, and for a merge whose keeper is not published.",
      tags: ["Listings"],
      successDescription:
        "The surviving listing's id and slug, or null when there is nowhere to send the visitor.",
      spec: withParameterExamples({
        id: "ylst_yacht-lagoon-42-aurora",
      }),
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ listingId: z.string(), slug: z.string() }).nullable())
    .handler(async ({ context, input }) => {
      const target = await getMergedListingTarget(context.db, input.id);
      return target ?? null;
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
      const [basis, amenityRanks] = await Promise.all([
        catalogueBasis(context.db),
        getAmenityRanks(context.db),
      ]);
      return docs.map((doc) => presentListingSummary(doc, basis, amenityRanks));
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
      const [basis, amenityRanks] = await Promise.all([
        catalogueBasis(context.db),
        getAmenityRanks(context.db),
      ]);
      const listings = await listSimilarListings(context.db, input.listingId, undefined, basis);
      return listings.map((listing) => presentListingSummary(listing, basis, amenityRanks));
    }),
};
