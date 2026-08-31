"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { listingAdminListQueryOptions } from "../api/queries";
import type { ListingStatus, ProviderKey } from "../types";

/*
 * Hooks over the admin catalogue procedures: the review-then-release loop for listings a
 * provider sync imported as `draft`.
 *
 * Both writes invalidate the whole listing segment on settle rather than on success: a status
 * change moves the row between the status filters, and a failed call leaves the row showing a
 * status the server may or may not have taken, so a refetch is the honest answer either way.
 */

export function useListings(input: {
  provider?: ProviderKey;
  status?: ListingStatus;
  query?: string;
  page: number;
}) {
  return useQuery(listingAdminListQueryOptions(input));
}

export function useSetListingStatus() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.listing.setStatus.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listing.key() }),
    }),
  );
}

/**
 * Releases every remaining draft belonging to one provider. The procedure also accepts no
 * provider at all, which publishes the entire catalogue's unreviewed drafts in one call; this
 * screen never offers that, so the scope is required here.
 */
export function usePublishDrafts() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.listing.publishDrafts.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listing.key() }),
    }),
  );
}

/**
 * Which vendor each part of a merged listing is taken from.
 *
 * Only fetched while the dialog is open: on a single-offer listing there is nothing to choose
 * between, and that is nearly every listing.
 */
export function useListingFieldSources(listingId: string) {
  return useQuery(orpc.admin.listing.fieldSources.queryOptions({ input: { listingId } }));
}

/**
 * Pins a field group to one vendor, or releases it back to the resolver.
 *
 * Invalidates the listing segment as well as its own query: pinning the media or the title
 * changes the row's own photograph and name in the table behind the dialog.
 */
export function useSetListingFieldSource() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.listing.setFieldSource.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listing.key() }),
    }),
  );
}

/**
 * Takes one provider's offer back out of a merged listing.
 *
 * Invalidates the whole listing segment: the offer leaves with its calendar and rates, so both
 * the listing it left and the one it lands on change in the table behind the dialog.
 */
export function useSplitListingOffer() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.match.split.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listing.key() }),
    }),
  );
}
