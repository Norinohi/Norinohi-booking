"use client";

import { useEffect, useRef } from "react";

const GUTTER = 24;

/**
 * Keeps a sticky element's bottom on the fold, whatever its current offset is.
 * `from` must match the breakpoint at which the element becomes sticky.
 */
export function useFillToFold<T extends HTMLElement = HTMLDivElement>(from: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const desktop = window.matchMedia(`(min-width: ${from})`);

    let frame = 0;
    const measure = () => {
      if (!desktop.matches) {
        el.style.removeProperty("max-height");
        return;
      }
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
    desktop.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      desktop.removeEventListener("change", schedule);
    };
  }, [from]);

  return ref;
}
