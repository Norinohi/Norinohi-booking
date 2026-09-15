"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { popularFacetsQueryOptions } from "../api/queries";
import type { PopularFacetKind, PopularFacetSurface } from "../types";

/*
 * Hooks over the curated-facet procedures.
 *
 * The write invalidates the whole segment on settle rather than on success, the way the FAQ
 * hooks do: a save that failed leaves the table showing an order the server may or may not have
 * taken, so refetching is the honest answer either way.
 */

export function usePopularFacets(input: {
  kind: PopularFacetKind;
  surface: PopularFacetSurface;
  locale?: string;
}) {
  return useQuery(popularFacetsQueryOptions(input));
}

export function useSetPopularFacets() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.admin.popularFacets.set.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.popularFacets.key() }),
    }),
  );
}

export function useFacetMedia(input: { kind: PopularFacetKind; value: string } | null) {
  return useQuery({
    ...orpc.admin.popularFacets.media.queryOptions({
      input: input ?? { kind: "country", value: "" },
    }),
    enabled: input !== null,
  });
}

/* Invalidates the list as well as the card: the table shows each value's photo. */
export function useUpdateFacetMedia() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.admin.popularFacets.updateMedia.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.popularFacets.key() }),
    }),
  );
}

export function useUploadFacetImage() {
  return useMutation(orpc.admin.popularFacets.uploadImage.mutationOptions());
}
