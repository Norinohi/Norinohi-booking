"use client";

import { useQueryStates } from "nuqs";

import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import { detailPeriodParsers } from "@/features/yachts/lib/search-params";

/*
 * The charter the visitor already searched for, handed over by the result card they clicked.
 * Without it the sidebar opened on an empty calendar and made them pick the same week twice.
 */
export function useSearchedPeriod(): CharterPeriod | null {
  const [carried] = useQueryStates(detailPeriodParsers);
  return carried.checkIn && carried.checkOut
    ? { checkIn: carried.checkIn, checkOut: carried.checkOut }
    : null;
}
