import { orpc } from "@/utils/orpc";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

/**
 * The marketplace-wide settings. One row for the whole site, so no filters and no page: the
 * key is the procedure's own.
 */
export const marketplaceSettingsQueryOptions = () => orpc.admin.settings.get.queryOptions({});

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const marketplaceSettingsKey = () => orpc.admin.settings.key();
export const updateMarketplaceSettingsMutationOptions = () =>
  orpc.admin.settings.update.mutationOptions();
