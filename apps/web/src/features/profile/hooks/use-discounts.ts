"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import {
  discountListQueryOptions,
  discountQueryOptions,
  discountYachtOptionsQueryOptions,
  listingPriceFiltersQueryOptions,
  listingPriceListQueryOptions,
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

  return useMutation(
    orpc.admin.discount.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.discount.key() }),
    }),
  );
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.discount.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.discount.key() }),
    }),
  );
}

/** Deactivating a code is its own audited action, separate from editing its fields. */
export function useSetDiscountActive() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.discount.setActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.discount.key() }),
    }),
  );
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

export function useListingPriceFilters() {
  return useQuery(listingPriceFiltersQueryOptions());
}

export function useUpdateListingPrice() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.listingPrice.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listingPrice.key() }),
    }),
  );
}

/** Drops the override and hands the listing back to the provider's own price. */
export function useClearListingPrice() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.listingPrice.clear.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listingPrice.key() }),
    }),
  );
}
