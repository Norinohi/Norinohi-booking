"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { geographyOptionsQueryOptions, routeListQueryOptions } from "../api/queries";
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
  return () => queryClient.invalidateQueries({ queryKey: orpc.admin.route.key() });
}

export function useRoutes(input: {
  query?: string;
  kind?: RouteKind;
  countryId?: string;
  active?: boolean;
  page: number;
}) {
  return useQuery(routeListQueryOptions(input));
}

/** Countries always, regions and bases narrowed to the chosen country and search term. */
export function useGeographyOptions(input: { countryId?: string; query?: string } = {}) {
  return useQuery(geographyOptionsQueryOptions(input));
}

export function useCreateRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.create.mutationOptions({ onSettled: invalidate }));
}

export function useUpdateRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.update.mutationOptions({ onSettled: invalidate }));
}

export function useSetRouteActive() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.setActive.mutationOptions({ onSettled: invalidate }));
}

export function useDeleteRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.delete.mutationOptions({ onSettled: invalidate }));
}

export function useCreateRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.stop.create.mutationOptions({ onSettled: invalidate }));
}

export function useUpdateRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.stop.update.mutationOptions({ onSettled: invalidate }));
}

export function useDeleteRouteStop() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.stop.delete.mutationOptions({ onSettled: invalidate }));
}

export function useReorderRouteStops() {
  const invalidate = useInvalidateRoutes();
  return useMutation(orpc.admin.route.stop.reorder.mutationOptions({ onSettled: invalidate }));
}
