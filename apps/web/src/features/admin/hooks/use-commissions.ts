"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { commissionListQueryOptions, commissionOperatorOptionsQueryOptions } from "../api/queries";
import type { CommissionStatus, ProviderKey } from "../types";

/*
 * Hooks over the commission-rate procedures. Every mutation invalidates the whole
 * `admin.commission` segment, so a rate switched off in one row is gone from the filtered
 * counts in the same render.
 */

export function useCommissions(input: {
  provider?: ProviderKey;
  status?: CommissionStatus;
  page: number;
}) {
  /* Same reason the duplicate queue keeps its previous page: a filter change that emptied the
     table would unmount the Select's own option and make the selection appear not to take. */
  return useQuery({ ...commissionListQueryOptions(input), placeholderData: keepPreviousData });
}

/** The form's operator picker. Mounted only while the dialog is open. */
export function useCommissionOperatorOptions(query: string) {
  return useQuery(commissionOperatorOptionsQueryOptions(query));
}

export function useCreateCommission() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.commission.create.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.commission.key() }),
    }),
  );
}

export function useUpdateCommission() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.commission.update.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.commission.key() }),
    }),
  );
}

/** Switching off keeps the row, so a lapsed agreement stays readable in the table. */
export function useSetCommissionActive() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.commission.setActive.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.commission.key() }),
    }),
  );
}
