"use client";

import { useBreakpoint } from "@yacht-charter/ui/hooks/use-breakpoint";
import type { Breakpoint } from "@yacht-charter/ui/lib/breakpoints";
import { useEffect, useRef } from "react";

const GUTTER = 24;

/**
 * Keeps a sticky element's bottom on the fold, whatever its current offset is.
 * `from` must match the breakpoint at which the element becomes sticky.
 */
export function useFillToFold<T extends HTMLElement = HTMLDivElement>(from: Breakpoint) {
  const ref = useRef<T>(null);
  const sticky = useBreakpoint(from);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!sticky) {
      el.style.removeProperty("max-height");
      return;
    }

    let frame = 0;
    const measure = () => {
      const pinned = Number.parseFloat(getComputedStyle(el).top) || 0;
      const { top } = el.getBoundingClientRect();
      const fromHere = window.innerHeight - top - GUTTER;
      const whenPinned = window.innerHeight - pinned - GUTTER;
      el.style.maxHeight = `${Math.max(Math.min(fromHere, whenPinned), 0)}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sticky]);

  return ref;
}
