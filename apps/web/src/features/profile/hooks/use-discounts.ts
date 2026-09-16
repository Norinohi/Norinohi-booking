"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  clearListingPriceMutationOptions,
  createDiscountMutationOptions,
  discountKey,
  discountListQueryOptions,
  discountQueryOptions,
  discountYachtOptionsQueryOptions,
  listingPriceFiltersQueryOptions,
  listingPriceListQueryOptions,
  listingPriceKey,
  listingPriceQueryOptions,
  setDiscountActiveMutationOptions,
  updateDiscountMutationOptions,
  updateListingPriceMutationOptions,
} from "../api/queries";

/*
 * Hooks over the admin Discount & Price Manager procedures. Every mutation
 * invalidates at the router-segment key, so lists, single rows and filter
 * options refresh together after a write.
 */

export function useDiscounts(input: { query?: string; page: number }) {
  return useQuery(discountListQueryOptions(input));
}

/** One promo code, for the edit modal — server-prefetched on /profile/discounts/edit/[id].
 * `null` (create mode) keeps the query idle. */
export function useDiscount(id: string | null) {
  return useQuery({ ...discountQueryOptions(id ?? ""), enabled: id !== null });
}

export function useDiscountYachtOptions(query: string) {
  return useQuery(discountYachtOptionsQueryOptions(query));
}

export function useCreateDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    ...createDiscountMutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKey() }),
  });
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    ...updateDiscountMutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKey() }),
  });
}

/** Deactivating a code is its own audited action, separate from editing its fields. */
export function useSetDiscountActive() {
  const queryClient = useQueryClient();

  return useMutation({
    ...setDiscountActiveMutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: discountKey() }),
  });
}

export function useListingPrices(input: {
  query?: string;
  category?: string;
  location?: string;
  page: number;
  pageSize?: number;
}) {
  return useQuery(listingPriceListQueryOptions(input));
}

export function useListingPrice(listingId: string) {
  return useQuery(listingPriceQueryOptions(listingId));
}

export function useListingPriceFilters() {
  return useQuery(listingPriceFiltersQueryOptions());
}

export function useUpdateListingPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    ...updateListingPriceMutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listingPriceKey() }),
  });
}

/** Drops the override and hands the listing back to the provider's own price. */
export function useClearListingPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    ...clearListingPriceMutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listingPriceKey() }),
  });
}
