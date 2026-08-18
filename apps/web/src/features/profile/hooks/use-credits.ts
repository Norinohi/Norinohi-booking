"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { creditBalanceQueryOptions, creditLedgerQueryOptions } from "../api/queries";

/** Spendable credit and how much of it expires within the month. */
export function useCreditBalance() {
  return useQuery(creditBalanceQueryOptions());
}

/** The append-only ledger behind that balance, newest first. */
export function useCreditLedger(page = 1) {
  return useQuery({ ...creditLedgerQueryOptions(page), placeholderData: keepPreviousData });
}
