import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import { orpc } from "@/utils/orpc";

/*
 * The booking flow's live calls. A quote is a firm price frozen for a short window and checkout
 * mutates a real reservation, so unlike the catalog reads nothing here is cached or prefetched —
 * these go through the header-forwarding `orpc` client because checkout is `protectedProcedure`.
 *
 * `quote` and `reprice` are mutations: each call creates an immutable priced snapshot and `reprice`
 * supersedes the previous one, returning a new `quoteId`. Callers hold the latest id, never refetch.
 */

export type Quote = Awaited<ReturnType<AppRouterClient["availability"]["quote"]>>;
export type QuoteLine = Quote["lines"][number];
export type QuoteInput = Parameters<AppRouterClient["availability"]["quote"]>[0];
export type RepriceInput = Parameters<AppRouterClient["availability"]["reprice"]>[0];

export const quoteMutationOptions = () => orpc.availability.quote.mutationOptions();
export const repriceMutationOptions = () => orpc.availability.reprice.mutationOptions();

export type CalendarInput = Parameters<AppRouterClient["availability"]["calendar"]>[0];

/** The enumerated slot list. Still read by callers that want the periods we pre-cut. */
export const availabilityCalendarQueryOptions = (input: CalendarInput) =>
  orpc.availability.calendar.queryOptions({ input });

/*
 * What the listing will actually sell, as constraints. The sidebar's calendar decides from these
 * rather than from the enumerated slots, which are a lossy projection of the same rules: a listing
 * that sells any three nights from any day is enumerated as three-night blocks once a week.
 */
export const availabilityConstraintsQueryOptions = (input: CalendarInput) =>
  orpc.availability.constraints.queryOptions({ input });

/*
 * Confirm Booking. Re-validates the quote, records the guest and consents, and holds the provider
 * option. Sign-in is optional: booking without one provisions the account and returns an
 * `accessToken`, which is what authorises everything below for a customer who has none yet.
 * Returns the `bookingId` the payment step and confirmation are keyed on.
 */
export const createHoldMutationOptions = () => orpc.checkout.createHold.mutationOptions();

/** Bank-transfer intent for a held booking — no Stripe needed. */
export const requestInvoiceMutationOptions = () => orpc.checkout.requestInvoice.mutationOptions();

/** A pre-payment question; leaves the booking held. */
export const askQuestionMutationOptions = () => orpc.checkout.askQuestion.mutationOptions();

export type BookingDetail = Awaited<ReturnType<AppRouterClient["booking"]["get"]>>;

/*
 * The booking-scoped reads. Each takes the guest token as well as the id, because the caller
 * may be a customer who has not set a password yet; a signed-in caller passes undefined and is
 * authorised by the session cookie instead. The token is part of the query key on purpose —
 * two callers with different rights must not share one cached answer.
 */

/** The held/confirmed booking behind the confirmation screen. */
export const bookingDetailQueryOptions = (id: string, accessToken?: string) =>
  orpc.booking.get.queryOptions({ input: { id, accessToken } });

/** The receipt for Download Receipt. */
export const bookingReceiptQueryOptions = (id: string, accessToken?: string) =>
  orpc.booking.receipt.queryOptions({ input: { id, accessToken } });

export type InvoiceDocument = NonNullable<
  Awaited<ReturnType<AppRouterClient["booking"]["invoice"]>>
>;

/** The printable invoice behind /bookings/[id]/invoice. Null for card bookings. */
export const bookingInvoiceQueryOptions = (id: string, accessToken?: string) =>
  orpc.booking.invoice.queryOptions({ input: { id, accessToken } });
