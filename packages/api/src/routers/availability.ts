import {
  listAvailabilityCalendar,
  listAvailabilityConstraints,
  type LocalizableQuoteLine,
  localizeQuoteLines,
} from "@yacht-charter/db/search";
import { quoteRequestWithDiscountSchema } from "@yacht-charter/providers";
import { z } from "zod";

import {
  availabilityCalendarInputSchema,
  availabilityCalendarSchema,
  availabilityConstraintsSchema,
} from "../contracts/catalog";
import { persistedQuoteSchema, repriceInputSchema } from "../contracts/quote";
import type { Database } from "../context";
import { publicProcedure } from "../index";
import { providerForListing, providerForQuote } from "../services/provider-routing";
import { createQuote, repriceQuote } from "../services/quote";
import { withJsonBodyExample, withParameterExamples } from "./openapi-examples";

/** Display only, and optional: an omitted locale reads the provider's own wording. */
const localeInputSchema = z.string().min(2).max(10).optional();

/**
 * A freshly persisted quote, read back in the caller's language.
 *
 * The row keeps the provider's wording - an invoice, a confirmation email and an operator's
 * admin view all read it, so one visitor's locale must not decide the language of the others.
 * Only what goes over the wire to that visitor is swapped.
 */
async function withLocalizedLines<T extends { listingId: string; lines: LocalizableQuoteLine[] }>(
  db: Database,
  quote: T,
  locale: string | undefined,
): Promise<T> {
  return { ...quote, lines: await localizeQuoteLines(db, quote.listingId, quote.lines, locale) };
}

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
    .handler(({ context, input }) => listAvailabilityCalendar(context.db, input)),
  constraints: publicProcedure
    .route({
      method: "GET",
      path: "/listings/{listingId}/availability-constraints",
      operationId: "listListingAvailabilityConstraints",
      summary: "List what a listing will sell, as constraints",
      description:
        "Returns the rules a charter period must satisfy for one listing over a date window: the allowed check-in/check-out weekdays and night counts, the periods the provider says are taken, the periods carrying a published rate, and any one-way drop-off windows. Unlike the availability calendar, which lists the periods we have enumerated, this describes the whole legal space, so a caller can evaluate a range nobody pre-cut. Final price and bookability are still settled by the quote endpoint.",
      tags: ["Availability"],
      successDescription: "Charter constraints for the requested listing and date range.",
      spec: withParameterExamples({
        listingId: "ylst_yacht-sunreef-60-celeste",
        from: "2026-07-01",
        to: "2026-09-30",
        currency: "EUR",
      }),
    })
    .input(availabilityCalendarInputSchema)
    .output(availabilityConstraintsSchema)
    .handler(({ context, input }) => listAvailabilityConstraints(context.db, input)),
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
        extras: ["sup"],
        crewType: "full-crew",
        currency: "EUR",
      }),
    })
    .input(quoteRequestWithDiscountSchema.extend({ locale: localeInputSchema }))
    .output(persistedQuoteSchema)
    .handler(async ({ context, input }) => {
      const quote = await createQuote(
        context.db,
        await providerForListing(context.db, context.provider, input.listingId),
        input,
        context.session?.user.id ?? null,
      );
      return withLocalizedLines(context.db, quote, input.locale);
    }),
  reprice: publicProcedure
    .route({
      method: "POST",
      path: "/availability/reprice",
      operationId: "repriceAvailabilityQuote",
      summary: "Re-price an existing quote",
      description:
        "Re-fetches the live provider price for an existing quote and returns a fresh one. Any of checkIn, checkOut, guests, extras or crewType may be changed; whatever is omitted keeps the previous quote's value, so the booking sidebar can move one control at a time. The previous quote is marked consumed and points at its replacement — quotes are immutable, so a changed price always produces a new row rather than editing the old one.",
      tags: ["Availability"],
      successDescription: "A new quote superseding the one that was passed in.",
      spec: withJsonBodyExample({
        quoteId: "qte_example",
        guests: 6,
        extras: ["sup"],
        crewType: "full-crew",
        discountCode: "SUMMER2026",
      }),
    })
    .input(repriceInputSchema)
    .output(persistedQuoteSchema)
    .handler(async ({ context, input }) => {
      const quote = await repriceQuote(
        context.db,
        await providerForQuote(context.db, context.provider, input.quoteId),
        input.quoteId,
        context.session?.user.id ?? null,
        {
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.guests,
          extras: input.extras,
          crewType: input.crewType,
          endBaseId: input.endBaseId,
          discountCode: input.discountCode,
          applyCredit: input.applyCredit,
        },
      );
      return withLocalizedLines(context.db, quote, input.locale);
    }),
};
