import { emptyInputSchema } from "../contracts/primitives";

import {
  wishlistIdsSchema,
  wishlistListInputSchema,
  wishlistListSchema,
  wishlistMergeInputSchema,
  wishlistMergeSchema,
  wishlistToggleInputSchema,
  wishlistToggleSchema,
} from "../contracts/wishlist";
import { protectedProcedure } from "../index";
import {
  addWishlistItem,
  listWishlist,
  listWishlistIds,
  mergeWishlist,
  removeWishlistItem,
} from "../services/wishlist";
import { withJsonBodyExample } from "./openapi-examples";

const EXAMPLE_LISTING_ID = "ylst_yacht-sunreef-60-celeste";

export const wishlistRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/wishlist/list",
      operationId: "listWishlistItems",
      summary: "List saved wishlist items",
      description:
        "Returns the authenticated user's saved listings as card-ready summaries, newest save first, with numbered pagination. Listings that are no longer published are omitted from the page but still counted in the totals.",
      tags: ["Wishlist"],
      successDescription: "A page of saved listings with pagination metadata.",
      spec: withJsonBodyExample({ page: 1, pageSize: 10 }),
    })
    .input(wishlistListInputSchema)
    .output(wishlistListSchema)
    .handler(({ context, input }) => listWishlist(context.db, context.session.user.id, input)),
  ids: protectedProcedure
    .route({
      method: "POST",
      path: "/wishlist/ids",
      operationId: "listWishlistListingIds",
      summary: "List saved listing IDs",
      description:
        "Returns just the listing IDs the authenticated user has saved. Backs the bookmark toggle on every listing card without hydrating full summaries.",
      tags: ["Wishlist"],
      successDescription: "Saved listing IDs for the current user.",
      spec: withJsonBodyExample({}),
    })
    .input(emptyInputSchema)
    .output(wishlistIdsSchema)
    .handler(({ context }) => listWishlistIds(context.db, context.session.user.id)),
  add: protectedProcedure
    .route({
      method: "POST",
      path: "/wishlist/add",
      operationId: "addWishlistItem",
      summary: "Add a listing to the wishlist",
      description:
        "Saves a listing for the authenticated user, creating the default wishlist on first use. Idempotent: re-adding a saved listing returns its original save timestamp.",
      tags: ["Wishlist"],
      successDescription: "The listing's saved state after the change.",
      spec: withJsonBodyExample({ listingId: EXAMPLE_LISTING_ID }),
    })
    .input(wishlistToggleInputSchema)
    .output(wishlistToggleSchema)
    .handler(({ context, input }) =>
      addWishlistItem(context.db, context.session.user.id, input.listingId),
    ),
  merge: protectedProcedure
    .route({
      method: "POST",
      path: "/wishlist/merge",
      operationId: "mergeWishlistItems",
      summary: "Merge a guest wishlist into the account",
      description:
        "Folds listings saved in the browser before sign-in into the authenticated user's wishlist, then returns the merged set so the client can clear its local copy. Idempotent: listings already saved keep their original save timestamp. `skipped` counts every ID that produced no new save, whether it was already saved or no longer exists — an unknown ID never fails the call.",
      tags: ["Wishlist"],
      successDescription: "The merged wishlist plus how many IDs were added and skipped.",
      spec: withJsonBodyExample({
        listingIds: [EXAMPLE_LISTING_ID, "ylst_yacht-lagoon-42-aurora"],
      }),
    })
    .input(wishlistMergeInputSchema)
    .output(wishlistMergeSchema)
    .handler(({ context, input }) =>
      mergeWishlist(context.db, context.session.user.id, input.listingIds),
    ),
  remove: protectedProcedure
    .route({
      method: "POST",
      path: "/wishlist/remove",
      operationId: "removeWishlistItem",
      summary: "Remove a listing from the wishlist",
      description:
        "Removes a listing from the authenticated user's wishlist. Idempotent: removing a listing that was never saved succeeds.",
      tags: ["Wishlist"],
      successDescription: "The listing's saved state after the change.",
      spec: withJsonBodyExample({ listingId: EXAMPLE_LISTING_ID }),
    })
    .input(wishlistToggleInputSchema)
    .output(wishlistToggleSchema)
    .handler(({ context, input }) =>
      removeWishlistItem(context.db, context.session.user.id, input.listingId),
    ),
};
