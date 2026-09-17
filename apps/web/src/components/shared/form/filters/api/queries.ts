import type { Locale } from "@/i18n/config";
import { orpc } from "@/utils/orpc";

import type { FacetScope } from "../lib/state";

/**
 * Filter facets. Cached server-side on the `days` tier (features/*​/api/server.ts), so the client
 * is told the same thing: re-fetching a taxonomy the server is holding for a day only undoes the
 * saving. Hydrated entries carry the cache-fill timestamp, so a shorter `staleTime` here would
 * make every first paint trigger a background refetch. See docs/adr/0002.
 *
 * `locale` belongs in the input, not in a header: the query key is derived from the procedure path
 * and input alone, so a header would give two languages one key and one of them the other's copy.
 * Passing it here is also what keeps a server prefetch and the client hook on the same entry — they
 * must be handed the same locale, or hydration seeds a key nothing reads and refetches on mount.
 */
const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * `scope` narrows the option lists to a place — the regions of the selected country rather than
 * every region on the platform. Omitted, the input is exactly `{ locale }`, which is the entry the
 * routes prefetch, so an untouched panel still hydrates instead of fetching.
 *
 * What a scoped read shows while it is in flight is `useFacets`'s business, not this factory's:
 * the server prefetch calls this too, and it has nothing to fall back to.
 */
/*
 * `priceBasis` only when the visitor picked one: the price bounds are read off whichever price the
 * cards show, and leaving the field off for the default keeps the key the route prefetched.
 */
export const facetsQueryOptions = (
  locale: Locale,
  scope: FacetScope = {},
  priceBasis?: "base" | "all_in" | null,
) =>
  orpc.charterSearch.facets.queryOptions({
    input: priceBasis ? { locale, ...scope, priceBasis } : { locale, ...scope },
    staleTime: ONE_DAY,
  });

/* The typeahead read, reused to spell a picked city: a city has no facet list of its own. */
export const citySuggestionsQueryOptions = (city: string, locale: string) =>
  orpc.charterSearch.suggestions.queryOptions({
    input: { query: city.replace(/-/g, " "), locale },
    staleTime: 5 * 60 * 1000,
  });
