import "server-only";

import { dehydrate } from "@tanstack/react-query";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getQueryClient } from "@/utils/query-client";

import { listingDetailQueryOptions } from "./queries";

export async function prefetchSearch() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(facetsQueryOptions());
  return dehydrate(queryClient);
}

export async function prefetchListingDetail(id: string) {
  const queryClient = getQueryClient();
  const listing = await queryClient.fetchQuery(listingDetailQueryOptions(id));
  return { state: dehydrate(queryClient), title: listing.title };
}
