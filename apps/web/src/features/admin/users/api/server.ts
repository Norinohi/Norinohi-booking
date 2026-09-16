import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { userListQueryOptions } from "./queries";

/** Server prefetch for /users: the first page of every account, newest first. */
export function prefetchUsers(queryClient: QueryClient) {
  return queryClient.prefetchQuery(userListQueryOptions({ page: 1 }));
}
