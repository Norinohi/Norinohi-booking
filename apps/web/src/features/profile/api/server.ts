import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { profileQueryOptions } from "./queries";

/** Server prefetch for the /profile route — pass to <Hydrated prefetch={...}>. */
export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery(profileQueryOptions());
}
