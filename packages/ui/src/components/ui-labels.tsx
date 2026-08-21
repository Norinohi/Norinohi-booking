"use client";

import * as React from "react";

/*
 * UiLabels — the English fallbacks the primitives use for their aria-labels and empty states.
 * This package holds no messages and knows no i18n library, so an app mounts `UiLabelsProvider`
 * once with translated values and every primitive picks them up. An explicit prop on a primitive
 * always wins over the context; the context wins over the English default.
 */
export type UiLabels = {
  close: string;
  previousPage: string;
  nextPage: string;
  /** `aria-label` of the pagination `<nav>` landmark. */
  pagination: string;
  /** `aria-label` of the breadcrumb `<nav>` landmark. */
  breadcrumb: string;
  previousPhoto: string;
  nextPhoto: string;
  goToPhoto: (index: number, total: number) => string;
  showPhoto: (index: number) => string;
  clear: (label: string) => string;
  noOptions: string;
  noMatches: string;
  showPassword: string;
  hidePassword: string;
  previousMonth: string;
  nextMonth: string;
  rating: (rating: number, max: number) => string;
};

const defaultUiLabels: UiLabels = {
  close: "Close",
  previousPage: "Go to previous page",
  nextPage: "Go to next page",
  pagination: "pagination",
  breadcrumb: "breadcrumb",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  goToPhoto: (index, total) => `Go to photo ${index} of ${total}`,
  showPhoto: (index) => `Show photo ${index}`,
  clear: (label) => `Clear ${label}`,
  noOptions: "No options",
  noMatches: "No matches",
  showPassword: "Show password",
  hidePassword: "Hide password",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  rating: (rating, max) => `Rating ${rating} out of ${max}`,
};

const UiLabelsContext = React.createContext<UiLabels>(defaultUiLabels);

function UiLabelsProvider({
  labels,
  children,
}: {
  /** Any label left out keeps its English default. */
  labels: Partial<UiLabels>;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ ...defaultUiLabels, ...labels }), [labels]);
  return <UiLabelsContext.Provider value={value}>{children}</UiLabelsContext.Provider>;
}

function useUiLabels(): UiLabels {
  return React.useContext(UiLabelsContext);
}

export { defaultUiLabels, UiLabelsProvider, useUiLabels };
