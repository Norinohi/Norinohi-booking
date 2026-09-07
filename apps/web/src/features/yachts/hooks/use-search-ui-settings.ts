"use client";

import { useQuery } from "@tanstack/react-query";

import { searchUiSettingsQueryOptions } from "../api/queries";

/**
 * Whether the search bar offers the free-text field.
 *
 * Off while the read is in flight, so the bar the design describes is what renders first and the
 * extra field appears only once the marketplace has actually asked for it.
 */
export function useNameSearchEnabled(): boolean {
  const { data } = useQuery(searchUiSettingsQueryOptions());
  return data?.nameSearchEnabled ?? false;
}
