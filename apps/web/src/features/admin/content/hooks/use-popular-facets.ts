"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  facetMediaQueryOptions,
  popularFacetsKey,
  popularFacetsQueryOptions,
  setPopularFacetsMutationOptions,
  updateFacetMediaMutationOptions,
  uploadFacetImageMutationOptions,
} from "../api/queries";
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
  return useMutation({
    ...setPopularFacetsMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: popularFacetsKey() }),
  });
}

export function useFacetMedia(input: { kind: PopularFacetKind; value: string } | null) {
  return useQuery({
    ...facetMediaQueryOptions(input ?? { kind: "country", value: "" }),
    enabled: input !== null,
  });
}

/* Invalidates the list as well as the card: the table shows each value's photo. */
export function useUpdateFacetMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    ...updateFacetMediaMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: popularFacetsKey() }),
  });
}

export function useUploadFacetImage() {
  return useMutation(uploadFacetImageMutationOptions());
}
