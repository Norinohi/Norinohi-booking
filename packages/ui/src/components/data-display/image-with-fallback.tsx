"use client";

import { ImageFallback } from "@yacht-charter/ui/components/data-display/image-fallback";
import { useState } from "react";

/*
 * ImageWithFallback — an <img> that shows ImageFallback when the record has no src or the image
 * fails to load, so a missing or broken photo reads as "no photo" rather than a broken tile.
 * `failedSrc` is keyed to the src that errored, so a later src change retries instead of staying
 * stuck on the fallback. An absent src never renders <img src="">, which would re-request the page.
 */
type ImageWithFallbackProps = Omit<React.ComponentProps<"img">, "src"> & {
  src?: string;
  /** Fill override forwarded to the fallback tile (e.g. a darker neutral behind a gradient scrim). */
  fallbackClassName?: string;
};

function ImageWithFallback({ src, alt = "", fallbackClassName, ...props }: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <ImageFallback className={fallbackClassName} />;

  return <img src={src} alt={alt} onError={() => setFailedSrc(src)} {...props} />;
}

export { ImageWithFallback };
