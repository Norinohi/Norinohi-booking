import { db } from "@yacht-charter/db";
import { listAvailabilityCalendar } from "@yacht-charter/db/search";
import { providerQuoteSchema, quoteRequestSchema } from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";

import { availabilityCalendarInputSchema, availabilityCalendarSchema } from "../contracts/catalog";
import { publicProcedure } from "../index";
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
        "Creates a live provider-backed quote for exact dates, guests, extras, and currency. In the current milestone this uses the mock provider; M4 will persist immutable quote and pricing snapshots.",
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
    .output(providerQuoteSchema)
    .handler(({ input }) => provider.getQuote(input)),
};
