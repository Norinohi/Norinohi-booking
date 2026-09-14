"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { popularYachtsConfigQueryOptions } from "../api/queries";

/*
 * Hooks over the popular-yachts slider screen. The save invalidates on settle, like the other
 * admin writes: a failed call leaves the form showing state the server may or may not have taken.
 */

export function usePopularYachtsConfig() {
  return useQuery(popularYachtsConfigQueryOptions());
}

export function useUpdatePopularYachtsConfig() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.admin.popularYachts.update.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.popularYachts.key() }),
    }),
  );
}
