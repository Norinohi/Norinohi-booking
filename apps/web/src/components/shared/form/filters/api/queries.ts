import { keepPreviousData } from "@tanstack/react-query";

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
 * `keepPreviousData` is what stops the Where selects emptying while a narrowed list is in flight:
 * a scope change is a new query key, and without it every tick of a country would blank the
 * controls below it for the length of a round trip.
 */
export const facetsQueryOptions = (locale: Locale, scope: FacetScope = {}) =>
  orpc.charterSearch.facets.queryOptions({
    input: { locale, ...scope },
    staleTime: ONE_DAY,
    placeholderData: keepPreviousData,
  });
