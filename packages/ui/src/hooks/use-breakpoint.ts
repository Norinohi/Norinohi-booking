"use client";

import { useCallback, useSyncExternalStore } from "react";

import { type Breakpoint, breakpointQuery } from "@yacht-charter/ui/lib/breakpoints";

function serverSnapshot() {
  return false;
}

/**
 * Whether a media query matches, kept live.
 *
 * The server has no viewport, so it and the hydrating render both answer `false`, and React
 * re-renders with the real value straight after hydration. Markup that differs per breakpoint
 * belongs in CSS instead; this is for behaviour that CSS cannot express.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, serverSnapshot);
}

/** Whether the viewport is at or above a Tailwind breakpoint, the same test as its `md:` variant. */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(breakpointQuery(breakpoint));
}
