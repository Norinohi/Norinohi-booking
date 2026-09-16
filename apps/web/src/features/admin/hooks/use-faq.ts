"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createFaqEntryMutationOptions,
  deleteFaqEntryMutationOptions,
  faqKey,
  faqListingOptionsQueryOptions,
  faqListQueryOptions,
  reorderFaqMutationOptions,
  updateFaqEntryMutationOptions,
} from "../api/queries";
import type { FaqCategory, FaqGap, FaqLocale, FaqScope } from "../types";

/*
 * Hooks over the FAQ authoring procedures.
 *
 * Every write invalidates the whole faq segment on settle rather than on success: a save can
 * move an entry between categories, fill a locale that a gap filter was listing, or renumber a
 * category, and any of those changes which rows this screen should be showing. A failed call
 * leaves the table showing state the server may or may not have taken, so refetching is the
 * honest answer either way — the same reason the listings hooks do it.
 */

export function useFaqList(input: {
  scope: FaqScope;
  listingId?: string;
  category?: FaqCategory;
  locale?: FaqLocale;
  query?: string;
  gap?: FaqGap;
  page: number;
}) {
  return useQuery({
    ...faqListQueryOptions(input),
    /* The contract refuses a listing scope with no listing, and "no yacht picked yet" is the
       normal state of the picker rather than a mistake worth a round trip to be told about. */
    enabled: input.scope === "site" || Boolean(input.listingId),
  });
}

function useFaqInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: faqKey() });
}

export function useCreateFaqEntry() {
  const invalidate = useFaqInvalidation();
  return useMutation({ ...createFaqEntryMutationOptions(), onSettled: invalidate });
}

export function useUpdateFaqEntry() {
  const invalidate = useFaqInvalidation();
  return useMutation({ ...updateFaqEntryMutationOptions(), onSettled: invalidate });
}

export function useDeleteFaqEntry() {
  const invalidate = useFaqInvalidation();
  return useMutation({ ...deleteFaqEntryMutationOptions(), onSettled: invalidate });
}

export function useReorderFaq() {
  const invalidate = useFaqInvalidation();
  return useMutation({ ...reorderFaqMutationOptions(), onSettled: invalidate });
}

/** The yacht typeahead behind the listing scope picker, shared with the discount editor. */
export function useFaqListingOptions(query: string) {
  return useQuery(faqListingOptionsQueryOptions(query));
}
