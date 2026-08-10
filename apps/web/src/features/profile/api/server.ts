import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
  discountListQueryOptions,
  discountQueryOptions,
  listingPriceFiltersQueryOptions,
  listingPriceListQueryOptions,
  profileQueryOptions,
  referralHistoryQueryOptions,
  referralSummaryQueryOptions,
} from "./queries";

/** Server prefetch for the /profile route — pass to <Hydrated prefetch={...}>. */
export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery(profileQueryOptions());
}

/** Server prefetch for the /profile/referrals route — pass to <Hydrated prefetch={...}>. */
export function prefetchReferrals(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery(referralSummaryQueryOptions()),
    queryClient.prefetchQuery(referralHistoryQueryOptions()),
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

/*
 * /profile/discounts/prices/[id] has no single-row endpoint (admin.listingPrice.get does
 * not exist yet), so the standalone price modal reads its row out of a one-page list
 * fetch. Fine for the mock catalogue; revisit when the API grows a get-by-id.
 */
export function prefetchListingPrices(queryClient: QueryClient) {
  return queryClient.prefetchQuery(listingPriceListQueryOptions({ page: 1, pageSize: 100 }));
}
