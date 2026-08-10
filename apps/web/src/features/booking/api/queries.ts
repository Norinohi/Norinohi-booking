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

/*
 * The week-slot calendar behind the sidebar's date control. Charters sell in fixed weekly slots
 * (Sat→Sat), so the date field offers whole available weeks rather than a free range — a range the
 * provider cannot honour just fails the quote with "slot not available".
 */
export const availabilityCalendarQueryOptions = (input: CalendarInput) =>
  orpc.availability.calendar.queryOptions({ input });
