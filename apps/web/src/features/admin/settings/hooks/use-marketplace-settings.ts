"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  marketplaceSettingsKey,
  marketplaceSettingsQueryOptions,
  updateMarketplaceSettingsMutationOptions,
} from "../api/queries";

/*
 * Hooks over the marketplace settings screen.
 *
 * The save invalidates on settle rather than on success, like the other admin writes: a failed
 * call leaves the form showing state the server may or may not have taken, and refetching is
 * the only honest answer either way.
 */

export function useMarketplaceSettings() {
  return useQuery(marketplaceSettingsQueryOptions());
}

export function useUpdateMarketplaceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    ...updateMarketplaceSettingsMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: marketplaceSettingsKey() }),
  });
}
