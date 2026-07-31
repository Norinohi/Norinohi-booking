"use client";

import { useEffect, useRef } from "react";

const GUTTER = 24;
const DESKTOP = "(min-width: 64rem)";

/** Keeps a sticky element's bottom on the fold, whatever its current offset is. Desktop only. */
export function useFillToFold() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const desktop = window.matchMedia(DESKTOP);

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
  }, []);

  return ref;
}
