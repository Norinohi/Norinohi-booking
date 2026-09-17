"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import {
  createRouteMutationOptions,
  createRouteStopMutationOptions,
  deleteRouteMutationOptions,
  deleteRouteStopMutationOptions,
  featuredRoutesQueryOptions,
  geographyOptionsQueryOptions,
  reorderFeaturedRoutesMutationOptions,
  reorderRouteStopsMutationOptions,
  routeKey,
  routeListQueryOptions,
  setRouteActiveMutationOptions,
  updateRouteMutationOptions,
  updateRouteStopMutationOptions,
} from "../api/queries";
import type { RouteKind } from "../types";

/*
 * Hooks over the suggested-route procedures.
 *
 * Every write invalidates the whole `admin.route` segment on settle rather than on success. The
 * stop mutations already answer with the route they changed, but the list page also carries the
 * stop count and the target label, and a failed call leaves the editor showing an order the
 * server may or may not have taken — a refetch is the honest answer either way.
 */

function useInvalidateRoutes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: routeKey() });
}

export function useRoutes(input: {
  query?: string;
  kind?: RouteKind;
  countryId?: string;
  active?: boolean;
  page: number;
}) {
  return useQuery(routeListQueryOptions({ ...input, locale: useLocale() }));
}

/** The routes the home page shows, in the order it shows them. */
export function useFeaturedRoutes() {
  return useQuery(featuredRoutesQueryOptions());
}

/*
 * Replaces the whole featured list. Partial orders are refused by the procedure, so the dialog
 * sends every id it is holding, including the ones it did not move.
 */
export function useReorderFeaturedRoutes() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...reorderFeaturedRoutesMutationOptions(), onSettled: invalidate });
}

/** Countries always, regions and bases narrowed to the chosen country and search term. */
export function useGeographyOptions(input: { countryId?: string; query?: string } = {}) {
  return useQuery(geographyOptionsQueryOptions({ ...input, locale: useLocale() }));
}

export function useCreateRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...createRouteMutationOptions(), onSettled: invalidate });
}

export function useUpdateRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...updateRouteMutationOptions(), onSettled: invalidate });
}

export function useSetRouteActive() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...setRouteActiveMutationOptions(), onSettled: invalidate });
}

export function useDeleteRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...deleteRouteMutationOptions(), onSettled: invalidate });
}

export function useCreateRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...createRouteStopMutationOptions(), onSettled: invalidate });
}

export function useUpdateRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...updateRouteStopMutationOptions(), onSettled: invalidate });
}

export function useDeleteRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...deleteRouteStopMutationOptions(), onSettled: invalidate });
}

export function useReorderRouteStops() {
  const invalidate = useInvalidateRoutes();
  return useMutation({ ...reorderRouteStopsMutationOptions(), onSettled: invalidate });
}
