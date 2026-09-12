"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { usePathname } from "@/i18n/navigation";

import { rememberSearch } from "../lib/last-search";

/**
 * Records where the visitor is searching, for the detail page's way back.
 *
 * Called from the result surfaces rather than from `useSearchFilters`, because it is the act of
 * looking at results that is worth returning to: a screen that merely reads a filter to build a
 * link is not a place anybody left.
 *
 * Reads `useSearchParams`, so it belongs inside a Suspense boundary — every caller is one already.
 */
export function useRememberSearch(): void {
  const pathname = usePathname();
  const params = useSearchParams().toString();

  useEffect(() => {
    rememberSearch(params ? `${pathname}?${params}` : pathname);
  }, [pathname, params]);
}
