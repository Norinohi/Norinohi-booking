"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reports when an element first scrolls near the viewport, then stops observing.
 *
 * For gating genuinely heavy widgets — a map engine, a video player — that sit below the fold.
 * `next/dynamic` alone is not enough for those: it defers *server* rendering, but the chunk still
 * downloads and initialises the moment the component mounts, which for a page that renders all its
 * sections at once means immediately.
 *
 * `rootMargin` starts the load slightly before the element is visible, so scrolling to it does not
 * mean waiting at a placeholder.
 */
export function useInViewport<T extends HTMLElement>(rootMargin = "300px") {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || entered) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [entered, rootMargin]);

  return { ref, entered };
}
