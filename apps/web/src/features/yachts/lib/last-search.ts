import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import { addDays } from "@/lib/date";

import { filterParsers } from "./search-params";

/**
 * The search the visitor left behind, so a detail page can send them back to it.
 *
 * The filters live in the query string and the detail URL carries none of them — only the dates,
 * which is all a listing needs. So "Back to search" had nowhere to read them from and pointed at
 * the bare catalogue, dropping every filter the visitor had set. The browser's own back button
 * always worked, because the history entry holds the whole URL; this is what gives the in-page
 * control the same memory.
 *
 * Per tab, and deliberately: two tabs are two searches, and a search is not worth carrying into
 * tomorrow. Path and query together, so a catalogue page (`/yacht-charter/croatia`) comes back as
 * itself rather than as the plain search with its facet lost. The path is stored without its
 * locale segment, which is the form `@/i18n/navigation` re-prefixes on the way out.
 */
const KEY = "yachts:last-search";

/** Where the control points before the visitor has run a search, and if storage is unavailable. */
export const SEARCH_FALLBACK_HREF = "/yachts";

export function rememberSearch(href: string): void {
  try {
    sessionStorage.setItem(KEY, href);
  } catch {
    /* Storage is refused in private mode and by some embedded browsers; the link falls back. */
  }
}

export function lastSearchHref(): string {
  try {
    return sessionStorage.getItem(KEY) ?? SEARCH_FALLBACK_HREF;
  } catch {
    return SEARCH_FALLBACK_HREF;
  }
}

/**
 * The exact charter a remembered search asked for, so a page without dates of its own (the
 * wishlist) can open a yacht on the week the visitor was looking at. Null for an undated search,
 * one of any length, or one whose start has already passed.
 */
export function periodFromSearchHref(href: string, today: string): CharterPeriod | null {
  const query = href.split("?")[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const checkIn = filterParsers.startDate.parse(params.get("startDate") ?? "");
  const duration = filterParsers.duration.parse(params.get("duration") ?? "");
  if (!checkIn || !duration || duration === "any" || checkIn < today) return null;
  return { checkIn, checkOut: addDays(checkIn, Number(duration)) };
}

export function lastSearchedPeriod(today: string): CharterPeriod | null {
  return periodFromSearchHref(lastSearchHref(), today);
}
