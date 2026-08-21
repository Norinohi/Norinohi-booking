import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import type { BookingStatus } from "../types";
import {
  bookingListQueryOptions,
  creditBalanceQueryOptions,
  creditLedgerQueryOptions,
  discountListQueryOptions,
  discountQueryOptions,
  listingPriceFiltersQueryOptions,
  listingPriceListQueryOptions,
  listingPriceQueryOptions,
  profileQueryOptions,
  referralHistoryQueryOptions,
  referralSummaryQueryOptions,
} from "./queries";

/** Server prefetch for the /profile route — pass to <Hydrated prefetch={...}>. */
export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery(profileQueryOptions());
}

/** Server prefetch for /profile/bookings — the first page for the given date/status filter. */
export function prefetchBookings(
  queryClient: QueryClient,
  input: { from?: string; to?: string; status?: BookingStatus[]; page: number },
) {
  return queryClient.prefetchQuery(bookingListQueryOptions(input));
}

/** Server prefetch for the /profile/referrals route — pass to <Hydrated prefetch={...}>. */
export function prefetchReferrals(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery(referralSummaryQueryOptions()),
    queryClient.prefetchQuery(referralHistoryQueryOptions()),
  ]);
}

/** Server prefetch for the /profile/credits route — pass to <Hydrated prefetch={...}>. */
export function prefetchCredits(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery(creditBalanceQueryOptions()),
    queryClient.prefetchQuery(creditLedgerQueryOptions()),
  ]);
}

/** Server prefetch for /profile/discounts — first page of both tabs plus the price filters. */
export function prefetchDiscountManager(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery(discountListQueryOptions({ page: 1 })),
    queryClient.prefetchQuery(listingPriceListQueryOptions({ page: 1 })),
    queryClient.prefetchQuery(listingPriceFiltersQueryOptions()),
  ]);
}

/** Server prefetch for /profile/discounts/edit/[id] — the promo code behind the edit modal. */
export function prefetchDiscount(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery(discountQueryOptions(id));
}

/** Server prefetch for /profile/discounts/prices/[id] — the one row behind the price modal. */
export function prefetchListingPrice(queryClient: QueryClient, listingId: string) {
  return queryClient.prefetchQuery(listingPriceQueryOptions(listingId));
}
