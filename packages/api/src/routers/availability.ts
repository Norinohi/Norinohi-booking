import { db } from "@yacht-charter/db";
import { listAvailabilityCalendar } from "@yacht-charter/db/search";
import { providerQuoteSchema, quoteRequestSchema } from "@yacht-charter/providers";
import { createInventoryProvider } from "@yacht-charter/providers";

import { availabilityCalendarInputSchema, availabilityCalendarSchema } from "../contracts/catalog";
import { publicProcedure } from "../index";

const provider = createInventoryProvider();

export const availabilityRouter = {
  calendar: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/availability-calendar",
      summary: "List cached listing availability slots",
    })
    .input(availabilityCalendarInputSchema)
    .output(availabilityCalendarSchema)
    .handler(({ input }) => listAvailabilityCalendar(db, input)),
  quote: publicProcedure
    .route({
      method: "POST",
      path: "/availability/quote",
      summary: "Create a live provider quote",
    })
    .input(quoteRequestSchema)
    .output(providerQuoteSchema)
    .handler(({ input }) => provider.getQuote(input)),
};
