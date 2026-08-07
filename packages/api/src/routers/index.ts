import type { RouterClient } from "@orpc/server";
import { emptyInputSchema } from "../contracts/primitives";

import {
  profileDeactivateOutputSchema,
  profileSchema,
  profileUpdateInputSchema,
} from "../contracts/profile";
import { protectedProcedure, publicProcedure } from "../index";
import { deactivateProfile, getProfile, updateProfile } from "../services/profile";
import { adminRouter } from "./admin";
import { availabilityRouter } from "./availability";
import { bookingRouter, checkoutRouter } from "./booking";
import { charterSearchRouter } from "./charter-search";
import { leadRouter } from "./lead";
import { listingsRouter } from "./listings";
import { withJsonBodyExample } from "./openapi-examples";
import { plannerRouter } from "./planner";
import { creditRouter, referralRouter } from "./referral";
import { wishlistRouter } from "./wishlist";

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
  planner: plannerRouter,
  lead: leadRouter,
  listings: listingsRouter,
  availability: availabilityRouter,
  wishlist: wishlistRouter,
  checkout: checkoutRouter,
  booking: bookingRouter,
  profile: {
    get: protectedProcedure
      .route({
        method: "POST",
        path: "/profile/get",
        operationId: "getProfile",
        summary: "Get the current user profile",
        description:
          "Returns the authenticated user's profile — display name, first/last name, email, phone, and the locale/currency/marketingOptIn preferences. First and last name fall back to a split of the Better Auth display name until the profile row is first saved.",
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
          "Persists editable profile fields (first/last name, phone, locale, currency, marketing opt-in) for the authenticated user and returns the updated profile. The Better Auth display name is rebuilt from first and last name so the account greeting stays in step. Email changes go through the Better Auth changeEmail flow, not this endpoint.",
        tags: ["Profile"],
        successDescription: "Updated profile data for the authenticated user.",
        spec: withJsonBodyExample({
          firstName: "Jane",
          lastName: "Doe",
          phone: "+380501234567",
          currency: "EUR",
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
  referral: referralRouter,
  credit: creditRouter,
  admin: adminRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
