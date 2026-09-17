"use client";

import { useQuery } from "@tanstack/react-query";

import { commissionOperatorOptionsQueryOptions } from "../api/queries";
import type { ProviderKey } from "../types";

/** Operator options by name. Without a provider every vendor's operators come back, each naming its vendors. */
export function useCommissionOperatorOptions(query: string, provider?: ProviderKey) {
  return useQuery(commissionOperatorOptionsQueryOptions(query, provider));
}
