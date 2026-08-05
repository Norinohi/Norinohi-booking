import "server-only";

import { dehydrate } from "@tanstack/react-query";

import { facetsQueryOptions } from "@/components/shared/form/filters/lib/queries";
import { getQueryClient } from "@/utils/query-client";

export async function prefetchSearch() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(facetsQueryOptions());
  return dehydrate(queryClient);
}
