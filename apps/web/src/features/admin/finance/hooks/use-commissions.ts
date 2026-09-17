"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  commissionKey,
  commissionListQueryOptions,
  createCommissionMutationOptions,
  setCommissionActiveMutationOptions,
  updateCommissionMutationOptions,
} from "../api/queries";
import type { CommissionStatus } from "../types";
import type { ProviderKey } from "../../shared/types";

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

export function useCreateCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    ...createCommissionMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: commissionKey() }),
  });
}

export function useUpdateCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    ...updateCommissionMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: commissionKey() }),
  });
}

/** Switching off keeps the row, so a lapsed agreement stays readable in the table. */
export function useSetCommissionActive() {
  const queryClient = useQueryClient();

  return useMutation({
    ...setCommissionActiveMutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: commissionKey() }),
  });
}
