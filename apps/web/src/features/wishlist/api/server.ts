import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { wishlistIdsQueryOptions, wishlistListQueryOptions } from "./queries";

/*
 * Call only once the route has confirmed a session: both procedures are protected,
 * so prefetching for a guest dehydrates an UNAUTHORIZED error that the global
 * QueryCache.onError toasts on hydration.
 */
export function prefetchWishlist(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery(wishlistIdsQueryOptions()),
    queryClient.prefetchQuery(wishlistListQueryOptions(1)),
  ]);
}
