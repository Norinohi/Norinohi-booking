import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
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
