import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { marketplaceSettingsQueryOptions } from "./queries";

export function prefetchMarketplaceSettings(queryClient: QueryClient) {
  return queryClient.prefetchQuery(marketplaceSettingsQueryOptions());
}
