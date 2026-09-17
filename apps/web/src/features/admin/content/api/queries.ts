import { orpc } from "@/utils/orpc";

import type {
  FaqCategory,
  FaqGap,
  FaqLocale,
  FaqScope,
  PopularFacetKind,
  PopularFacetSurface,
  RouteKind,
} from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const ROUTES_PAGE_SIZE = 20;
export const FAQ_PAGE_SIZE = 20;

/*
 * The hand-authored route library. Nothing syncs into it and nothing else writes it, so it goes
 * stale only when a colleague authors one — the same reason the review queues carry a short
 * staleTime rather than none.
 */
/*
 * The home page's own list, which is a different question from the library: `admin.route.list`
 * pages through everything staff ever wrote, this is the handful the site shows and the order it
 * shows them in. Read on its own so the picker and the selection cannot disagree about the order.
 */
export const featuredRoutesQueryOptions = () =>
  orpc.admin.route.listFeatured.queryOptions({ input: {}, staleTime: 15_000 });

export const routeListQueryOptions = (input: {
  query?: string;
  kind?: RouteKind;
  countryId?: string;
  active?: boolean;
  locale: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.route.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? ROUTES_PAGE_SIZE },
    staleTime: 15_000,
  });

/**
 * Countries, regions and bases for the target picker.
 *
 * Geography is written by the catalogue sync and read here; it changes when a provider ships a
 * new marina, which is not within one authoring session. Kept for the life of the tab.
 */
export const geographyOptionsQueryOptions = (input: {
  countryId?: string;
  query?: string;
  locale: string;
}) =>
  orpc.admin.geography.options.queryOptions({
    input: { ...input, limit: 200 },
    staleTime: 5 * 60_000,
  });

/*
 * The FAQ, one row per question rather than one per locale.
 *
 * Hand-written and hand-translated, so it moves only when a colleague edits it — the same short
 * staleTime the review queues carry, for the same reason. `locale` is part of the key because it
 * changes what the answer says, not only what is shown: it is the language the gap counts and
 * the search are asked about.
 */
export const faqListQueryOptions = (input: {
  scope: FaqScope;
  listingId?: string;
  category?: FaqCategory;
  locale?: FaqLocale;
  query?: string;
  gap?: FaqGap;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.faq.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? FAQ_PAGE_SIZE },
    staleTime: 15_000,
  });

/**
 * The curated order for one facet kind and surface.
 *
 * Both keys are part of the query key because both change the answer rather than only its
 * presentation: `kind` picks which vocabulary is listed, `surface` which of the two ranks is
 * read. The same short staleTime as the FAQ, and for the same reason -- this moves only when a
 * colleague edits it.
 */
export const popularFacetsQueryOptions = (input: {
  kind: PopularFacetKind;
  surface: PopularFacetSurface;
  locale?: string;
}) => orpc.admin.popularFacets.list.queryOptions({ input, staleTime: 15_000 });

/** How the home page's popular-yachts slider is composed. One row, like the settings. */
export const popularYachtsConfigQueryOptions = () => orpc.admin.popularYachts.get.queryOptions({});

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const routeKey = () => orpc.admin.route.key();
export const reorderFeaturedRoutesMutationOptions = () =>
  orpc.admin.route.reorderFeatured.mutationOptions();
export const createRouteMutationOptions = () => orpc.admin.route.create.mutationOptions();
export const updateRouteMutationOptions = () => orpc.admin.route.update.mutationOptions();
export const setRouteActiveMutationOptions = () => orpc.admin.route.setActive.mutationOptions();
export const deleteRouteMutationOptions = () => orpc.admin.route.delete.mutationOptions();
export const createRouteStopMutationOptions = () => orpc.admin.route.stop.create.mutationOptions();
export const updateRouteStopMutationOptions = () => orpc.admin.route.stop.update.mutationOptions();
export const deleteRouteStopMutationOptions = () => orpc.admin.route.stop.delete.mutationOptions();
export const reorderRouteStopsMutationOptions = () =>
  orpc.admin.route.stop.reorder.mutationOptions();

export const faqKey = () => orpc.admin.faq.key();
export const faqListingOptionsQueryOptions = (query: string) =>
  orpc.admin.discount.yachtOptions.queryOptions({
    input: { query: query.trim() || undefined, limit: 20 },
    staleTime: 60_000,
  });
export const createFaqEntryMutationOptions = () => orpc.admin.faq.create.mutationOptions();
export const updateFaqEntryMutationOptions = () => orpc.admin.faq.update.mutationOptions();
export const deleteFaqEntryMutationOptions = () => orpc.admin.faq.delete.mutationOptions();
export const reorderFaqMutationOptions = () => orpc.admin.faq.reorder.mutationOptions();

export const popularFacetsKey = () => orpc.admin.popularFacets.key();
export const facetMediaQueryOptions = (input: { kind: PopularFacetKind; value: string }) =>
  orpc.admin.popularFacets.media.queryOptions({ input });
export const setPopularFacetsMutationOptions = () => orpc.admin.popularFacets.set.mutationOptions();
export const updateFacetMediaMutationOptions = () =>
  orpc.admin.popularFacets.updateMedia.mutationOptions();
export const uploadFacetImageMutationOptions = () =>
  orpc.admin.popularFacets.uploadImage.mutationOptions();

export const popularYachtsConfigKey = () => orpc.admin.popularYachts.key();
export const updatePopularYachtsConfigMutationOptions = () =>
  orpc.admin.popularYachts.update.mutationOptions();
