import type { RouterClient } from "@orpc/server";
import {
  availabilityCalendarSchema,
  availabilitySearchSchema,
  listingPeriodSchema,
  listingSummarySchema,
  providerCapabilitiesSchema,
  providerQuoteSchema,
  quoteRequestSchema,
} from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";
import { z } from "zod";

import { adminProcedure, protectedProcedure, publicProcedure } from "../index";

const provider = createInventoryProvider();

const emptyInputSchema = z.object({}).default({});
const idInputSchema = z.object({ id: z.string() });
const listingIdInputSchema = z.object({ listingId: z.string() });

const searchResultSchema = z.object({
  items: z.array(
    z.object({
      offerId: z.string(),
      listing: listingSummarySchema,
      price: z.object({
        amountMinor: z.number().int(),
        currency: z.string().length(3),
      }),
      checkIn: z.string(),
      checkOut: z.string(),
    }),
  ),
  nextCursor: z.string().optional(),
});

const facetsSchema = z.object({
  destinations: z.array(z.string()),
  categories: z.array(z.string()),
  amenities: z.array(z.string()),
  priceRange: z.object({
    minMinor: z.number().int(),
    maxMinor: z.number().int(),
    currency: z.string().length(3),
  }),
});

const mapResultSchema = z.object({
  markers: z.array(
    z.object({
      listingId: z.string(),
      title: z.string(),
      lat: z.number(),
      lng: z.number(),
      priceFromMinor: z.number().int(),
      currency: z.string().length(3),
    }),
  ),
});

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
  search: {
    query: publicProcedure
      .input(availabilitySearchSchema)
      .output(searchResultSchema)
      .handler(async ({ input }) => {
        const offers = await provider.searchAvailability(input);
        return {
          items: offers.map((offer) => ({
            offerId: offer.id,
            listing: offer.listing,
            price: offer.clientPrice,
            checkIn: offer.checkIn,
            checkOut: offer.checkOut,
          })),
        };
      }),
    facets: publicProcedure
      .input(emptyInputSchema)
      .output(facetsSchema)
      .handler(async () => {
        const offers = await provider.searchAvailability({});
        const listings = offers.map((offer) => offer.listing);
        const prices = listings.map((listing) => listing.priceFrom.amountMinor);
        return {
          destinations: [...new Set(listings.map((listing) => listing.base.country))],
          categories: [...new Set(listings.map((listing) => listing.category))],
          amenities: [...new Set(listings.flatMap((listing) => listing.amenities))],
          priceRange: {
            minMinor: Math.min(...prices),
            maxMinor: Math.max(...prices),
            currency: "EUR",
          },
        };
      }),
    map: publicProcedure
      .input(availabilitySearchSchema)
      .output(mapResultSchema)
      .handler(async ({ input }) => {
        const offers = await provider.searchAvailability(input);
        return {
          markers: offers.map((offer) => ({
            listingId: offer.listing.id,
            title: offer.listing.title,
            lat: offer.listing.base.lat,
            lng: offer.listing.base.lng,
            priceFromMinor: offer.listing.priceFrom.amountMinor,
            currency: offer.listing.priceFrom.currency,
          })),
        };
      }),
    suggest: publicProcedure
      .input(z.object({ query: z.string().default("") }))
      .output(z.array(z.string()))
      .handler(async ({ input }) => {
        const offers = await provider.searchAvailability({});
        const query = input.query.toLowerCase();
        return [
          ...new Set(
            offers.flatMap((offer) => [
              offer.listing.base.country,
              offer.listing.base.region,
              offer.listing.base.location,
              offer.listing.base.name,
            ]),
          ),
        ].filter((item) => item.toLowerCase().includes(query));
      }),
  },
  listing: {
    get: publicProcedure
      .input(idInputSchema)
      .output(listingSummarySchema)
      .handler(async ({ input }) => {
        const offers = await provider.searchAvailability({});
        const listing = offers
          .map((offer) => offer.listing)
          .find((item) => item.id === input.id || item.slug === input.id);
        if (!listing) {
          throw new Error("Listing not found");
        }
        return listing;
      }),
    reviews: publicProcedure
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
      .handler(({ input }) => [
        {
          id: `rev_${input.listingId}`,
          rating: 5,
          author: "Marta K.",
          body: "Clean handover, accurate photos, and a smooth week aboard.",
        },
      ]),
    similar: publicProcedure
      .input(listingIdInputSchema)
      .output(z.array(listingSummarySchema))
      .handler(async ({ input }) => {
        const offers = await provider.searchAvailability({});
        return offers
          .map((offer) => offer.listing)
          .filter((listing) => listing.id !== input.listingId)
          .slice(0, 3);
      }),
  },
  availability: {
    calendar: publicProcedure
      .input(listingPeriodSchema)
      .output(availabilityCalendarSchema)
      .handler(({ input }) => provider.getAvailability(input)),
    quote: publicProcedure
      .input(quoteRequestSchema)
      .output(providerQuoteSchema)
      .handler(({ input }) => provider.getQuote(input)),
  },
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
