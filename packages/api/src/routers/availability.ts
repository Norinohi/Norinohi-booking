import { db } from "@yacht-charter/db";
import { listAvailabilityCalendar } from "@yacht-charter/db/search";
import { quoteRequestSchema } from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";
import { z } from "zod";

import { availabilityCalendarInputSchema, availabilityCalendarSchema } from "../contracts/catalog";
import { persistedQuoteSchema } from "../contracts/quote";
import { publicProcedure } from "../index";
import { createQuote, repriceQuote } from "../services/quote";
import { withJsonBodyExample, withParameterExamples } from "./openapi-examples";

const provider = createInventoryProvider();

export const availabilityRouter = {
  calendar: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/availability-calendar",
      operationId: "listListingAvailabilityCalendar",
      summary: "List cached listing availability slots",
      description:
        "Returns cached availability slots for a listing over a requested date window. This powers the detail-page calendar and search experience; final price and bookability are revalidated by the quote endpoint.",
      tags: ["Availability"],
      successDescription: "Cached availability slots for the requested listing and date range.",
      spec: withParameterExamples({
        listingId: "ylst_yacht-sunreef-60-celeste",
        from: "2026-07-01",
        to: "2026-09-30",
        currency: "EUR",
      }),
    })
    .input(availabilityCalendarInputSchema)
    .output(availabilityCalendarSchema)
    .handler(({ input }) => listAvailabilityCalendar(db, input)),
  quote: publicProcedure
    .route({
      method: "POST",
      path: "/availability/quote",
      operationId: "createAvailabilityQuote",
      summary: "Create a live provider quote",
      description:
        "Creates a live provider-backed quote for exact dates, guests, extras, and currency, and persists it as an immutable priced snapshot with an expiry and a price fingerprint. Quoting is public — an anonymous quote is claimed by the first signed-in user to reprice or check out with it.",
      tags: ["Availability"],
      successDescription: "Provider quote with priced offer details and payment policy data.",
      spec: withJsonBodyExample({
        listingId: "ylst_yacht-sunreef-60-celeste",
        checkIn: "2026-07-04",
        checkOut: "2026-07-11",
        guests: 6,
        extras: ["skipper", "hostess"],
        currency: "EUR",
      }),
    })
    .input(quoteRequestSchema)
    .output(persistedQuoteSchema)
    .handler(({ context, input }) =>
      createQuote(context.db, provider, input, context.session?.user.id ?? null),
    ),
  reprice: publicProcedure
    .route({
      method: "POST",
      path: "/availability/reprice",
      operationId: "repriceAvailabilityQuote",
      summary: "Re-price an existing quote",
      description:
        "Re-fetches the live provider price for an existing quote and returns a fresh one. The previous quote is marked consumed and points at its replacement — quotes are immutable, so a changed price always produces a new row rather than editing the old one.",
      tags: ["Availability"],
      successDescription: "A new quote superseding the one that was passed in.",
      spec: withJsonBodyExample({ quoteId: "qte_example" }),
    })
    .input(z.object({ quoteId: z.string().min(1) }))
    .output(persistedQuoteSchema)
    .handler(({ context, input }) =>
      repriceQuote(context.db, provider, input.quoteId, context.session?.user.id ?? null),
    ),
};
