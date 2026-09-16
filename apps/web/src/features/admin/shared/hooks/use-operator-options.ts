"use client";

import { useQuery } from "@tanstack/react-query";

import { commissionOperatorOptionsQueryOptions } from "../api/queries";

/** The form's operator picker. Mounted only while the dialog is open. */
export function useCommissionOperatorOptions(query: string) {
  return useQuery(commissionOperatorOptionsQueryOptions(query));
}
