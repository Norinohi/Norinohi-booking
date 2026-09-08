"use client";

import { useQuery } from "@tanstack/react-query";

import { fxRatesQueryOptions, searchUiSettingsQueryOptions } from "../api/queries";

/*
 * The two client reads the currency layer needs. Both are public and cached hard: the settings
 * change when an admin saves, and the rates once a working day.
 */

export function useCurrencySettings() {
  return useQuery(searchUiSettingsQueryOptions());
}

/**
 * Fetched only once the marketplace has turned the feature on, so a deployment showing vendor
 * currencies never asks for a table it would not read.
 */
export function useFxRates(enabled: boolean) {
  return useQuery({ ...fxRatesQueryOptions(), enabled });
}
