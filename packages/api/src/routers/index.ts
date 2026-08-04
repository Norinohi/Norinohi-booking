import type { RouterClient } from "@orpc/server";
import { providerCapabilitiesSchema } from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";
import { z } from "zod";

import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import { availabilityRouter } from "./availability";
import { charterSearchRouter } from "./charter-search";
import { listingsRouter } from "./listings";

const provider = createInventoryProvider();

const emptyInputSchema = z.object({}).default({});
const listingIdInputSchema = z.object({ listingId: z.string() });

const profileSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  phone: z.string().nullable(),
  locale: z.string(),
  currency: z.string().length(3),
  marketingOptIn: z.boolean(),
});

const wishlistItemSchema = z.object({
  listingId: z.string(),
  savedAt: z.string(),
});

const wishlistState = new Map<string, Set<string>>();

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
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
      .input(emptyInputSchema)
      .output(profileSchema)
      .handler(({ context }) => ({
        userId: context.session.user.id,
        name: context.session.user.name ?? null,
        email: context.session.user.email,
        phone: null,
        locale: "en",
        currency: "EUR",
        marketingOptIn: false,
      })),
    update: protectedProcedure
      .input(
        z.object({
          phone: z.string().nullable().optional(),
          locale: z.string().optional(),
          currency: z.string().length(3).optional(),
          marketingOptIn: z.boolean().optional(),
        }),
      )
      .output(profileSchema)
      .handler(({ context, input }) => ({
        userId: context.session.user.id,
        name: context.session.user.name ?? null,
        email: context.session.user.email,
        phone: input.phone ?? null,
        locale: input.locale ?? "en",
        currency: input.currency ?? "EUR",
        marketingOptIn: input.marketingOptIn ?? false,
      })),
  },
  referral: {
    myCode: protectedProcedure
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
        .input(emptyInputSchema)
        .output(providerCapabilitiesSchema)
        .handler(() => provider.capabilities()),
    },
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
