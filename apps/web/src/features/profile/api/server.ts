import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { profileQueryOptions, referralCodeQueryOptions } from "./queries";

/** Server prefetch for the /profile route — pass to <Hydrated prefetch={...}>. */
export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery(profileQueryOptions());
}

/** Server prefetch for the /profile/referrals route — pass to <Hydrated prefetch={...}>. */
export function prefetchReferrals(queryClient: QueryClient) {
  return queryClient.prefetchQuery(referralCodeQueryOptions());
}
