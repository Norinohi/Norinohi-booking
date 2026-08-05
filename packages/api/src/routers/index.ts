import type { RouterClient } from "@orpc/server";
import { providerCapabilitiesSchema } from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";
import { z } from "zod";

import {
  profileDeactivateOutputSchema,
  profileSchema,
  profileUpdateInputSchema,
} from "../contracts/profile";
import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import { deactivateProfile, getProfile, updateProfile } from "../services/profile";
import { availabilityRouter } from "./availability";
import { charterSearchRouter } from "./charter-search";
import { listingsRouter } from "./listings";
import { withJsonBodyExample } from "./openapi-examples";

const provider = createInventoryProvider();

const emptyInputSchema = z.object({}).default({});
const listingIdInputSchema = z.object({ listingId: z.string() });

const wishlistItemSchema = z.object({
  listingId: z.string(),
  savedAt: z.string(),
});

const wishlistState = new Map<string, Set<string>>();

export const appRouter = {
  healthCheck: publicProcedure
    .route({
      method: "POST",
      path: "/healthCheck",
      operationId: "healthCheck",
      summary: "Check API health",
      description: "Returns a simple OK response when the oRPC API process is reachable.",
      tags: ["System"],
      successDescription: "The API process is reachable.",
      spec: withJsonBodyExample({}),
    })
    .handler(() => {
      return "OK";
    }),
  privateData: protectedProcedure
    .route({
      method: "POST",
      path: "/privateData",
      operationId: "getPrivateData",
      summary: "Read authenticated session data",
      description:
        "Demo protected endpoint that confirms Better Auth session resolution in the oRPC context. Requires an authenticated user session.",
      tags: ["System"],
      successDescription: "Authenticated session data from the current request context.",
      spec: withJsonBodyExample({}),
    })
    .handler(({ context }) => {
      return {
        message: "This is private",
        user: context.session?.user,
      };
    }),
  charterSearch: charterSearchRouter,
  listings: listingsRouter,
  availability: availabilityRouter,
  wishlist: {
    list: protectedProcedure
      .route({
        method: "POST",
        path: "/wishlist/list",
        operationId: "listWishlistItems",
        summary: "List saved wishlist items",
        description:
          "Returns listing IDs saved by the authenticated user. This milestone uses an in-memory wishlist stub until the persisted wishlist service is wired.",
        tags: ["Wishlist"],
        successDescription: "Wishlist listing IDs saved by the current user.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(z.array(wishlistItemSchema))
      .handler(({ context }) => {
        const saved = wishlistState.get(context.session.user.id) ?? new Set<string>();
        return [...saved].map((listingId) => ({
          listingId,
          savedAt: new Date().toISOString(),
        }));
      }),
    add: protectedProcedure
      .route({
        method: "POST",
        path: "/wishlist/add",
        operationId: "addWishlistItem",
        summary: "Add a listing to the wishlist",
        description:
          "Adds a listing ID to the authenticated user's wishlist and returns the updated wishlist state. This milestone uses an in-memory wishlist stub.",
        tags: ["Wishlist"],
        successDescription: "Updated wishlist after adding the listing.",
        spec: withJsonBodyExample({
          listingId: "ylst_yacht-sunreef-60-celeste",
        }),
      })
      .input(listingIdInputSchema)
      .output(z.array(wishlistItemSchema))
      .handler(({ context, input }) => {
        const saved = wishlistState.get(context.session.user.id) ?? new Set<string>();
        saved.add(input.listingId);
        wishlistState.set(context.session.user.id, saved);
        return [...saved].map((listingId) => ({
          listingId,
          savedAt: new Date().toISOString(),
        }));
      }),
    remove: protectedProcedure
      .route({
        method: "POST",
        path: "/wishlist/remove",
        operationId: "removeWishlistItem",
        summary: "Remove a listing from the wishlist",
        description:
          "Removes a listing ID from the authenticated user's wishlist and returns the updated wishlist state. This milestone uses an in-memory wishlist stub.",
        tags: ["Wishlist"],
        successDescription: "Updated wishlist after removing the listing.",
        spec: withJsonBodyExample({
          listingId: "ylst_yacht-sunreef-60-celeste",
        }),
      })
      .input(listingIdInputSchema)
      .output(z.array(wishlistItemSchema))
      .handler(({ context, input }) => {
        const saved = wishlistState.get(context.session.user.id) ?? new Set<string>();
        saved.delete(input.listingId);
        wishlistState.set(context.session.user.id, saved);
        return [...saved].map((listingId) => ({
          listingId,
          savedAt: new Date().toISOString(),
        }));
      }),
  },
  profile: {
    get: protectedProcedure
      .route({
        method: "POST",
        path: "/profile/get",
        operationId: "getProfile",
        summary: "Get the current user profile",
        description:
          "Returns the authenticated user's profile (name, email, phone) read from the database. Preference fields (locale, currency, marketingOptIn) are static defaults until the preference columns land in a later milestone.",
        tags: ["Profile"],
        successDescription: "Profile data for the authenticated user.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(profileSchema)
      .handler(({ context }) => getProfile(context.db, context.session.user.id)),
    update: protectedProcedure
      .route({
        method: "POST",
        path: "/profile/update",
        operationId: "updateProfile",
        summary: "Update the current user profile",
        description:
          "Persists editable profile fields (name, phone) for the authenticated user and returns the updated profile. Email changes go through the Better Auth changeEmail flow, not this endpoint. Preference fields (locale, currency, marketingOptIn) remain static defaults until the preference columns land in a later milestone.",
        tags: ["Profile"],
        successDescription: "Updated profile data for the authenticated user.",
        spec: withJsonBodyExample({
          name: "Jane Doe",
          phone: "+380501234567",
        }),
      })
      .input(profileUpdateInputSchema)
      .output(profileSchema)
      .handler(({ context, input }) => updateProfile(context.db, context.session.user.id, input)),
    deactivate: protectedProcedure
      .route({
        method: "POST",
        path: "/profile/deactivate",
        operationId: "deactivateProfile",
        summary: "Deactivate the current user account",
        description:
          "Marks the authenticated user's account as deactivated and revokes all of their sessions. The account is reactivated by simply signing in again.",
        tags: ["Profile"],
        successDescription: "The account was deactivated and all sessions were revoked.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(profileDeactivateOutputSchema)
      .handler(async ({ context }) => {
        await deactivateProfile(context.db, context.session.user.id);
        return { deactivated: true as const };
      }),
  },
  referral: {
    myCode: protectedProcedure
      .route({
        method: "POST",
        path: "/referral/myCode",
        operationId: "getReferralCode",
        summary: "Get the current user's referral code",
        description:
          "Returns the authenticated user's deterministic demo referral code and registration URL path.",
        tags: ["Referral"],
        successDescription: "Referral code and URL path for the authenticated user.",
        spec: withJsonBodyExample({}),
      })
      .input(emptyInputSchema)
      .output(z.object({ code: z.string(), urlPath: z.string() }))
      .handler(({ context }) => {
        const code = `NORI-${context.session.user.id.slice(0, 6).toUpperCase()}`;
        return {
          code,
          urlPath: `/register?ref=${code}`,
        };
      }),
    redeem: protectedProcedure
      .route({
        method: "POST",
        path: "/referral/redeem",
        operationId: "redeemReferralCode",
        summary: "Redeem a referral code",
        description:
          "Accepts a referral code and returns whether it was accepted. This milestone returns a deterministic demo response before booking-linked redemption is implemented.",
        tags: ["Referral"],
        successDescription: "Referral redemption result.",
        spec: withJsonBodyExample({
          code: "NORI-DEMO01",
        }),
      })
      .input(z.object({ code: z.string().min(1) }))
      .output(z.object({ accepted: z.boolean(), code: z.string() }))
      .handler(({ input }) => ({
        accepted: true,
        code: input.code,
      })),
  },
  admin: {
    provider: {
      capabilities: adminProcedure
        .route({
          method: "POST",
          path: "/admin/provider/capabilities",
          operationId: "getProviderCapabilities",
          summary: "Get active provider capabilities",
          description:
            "Returns the active inventory provider's supported booking and quote capabilities. Requires an authenticated admin user.",
          tags: ["Admin"],
          successDescription: "Capabilities for the currently configured inventory provider.",
          spec: withJsonBodyExample({}),
        })
        .input(emptyInputSchema)
        .output(providerCapabilitiesSchema)
        .handler(() => provider.capabilities()),
    },
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
