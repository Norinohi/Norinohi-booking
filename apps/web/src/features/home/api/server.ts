import "server-only";

import { dehydrate } from "@tanstack/react-query";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getQueryClient } from "@/utils/query-client";

import { popularYachtsQueryOptions } from "./queries";

/** Server prefetch for the home page — facets feed the destination/boat-type/budget sections. */
export async function prefetchHome() {
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(facetsQueryOptions()),
    queryClient.prefetchQuery(popularYachtsQueryOptions()),
  ]);
  return dehydrate(queryClient);
}
