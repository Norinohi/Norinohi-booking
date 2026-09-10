"use client";

import { env } from "@yacht-charter/env/web";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ImageFallback } from "@yacht-charter/ui/components/data-display/image-fallback";
import { Loader2 } from "lucide-react";
import NextImage, { type ImageLoaderProps } from "next/image";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { z } from "zod";

type ImageSrc = ComponentProps<typeof NextImage>["src"];

const srcUrlSchema = z.string();

function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  const transforms = [
    "f_auto",
    `q_auto${quality ? `:${quality}` : ""}`,
    "c_limit",
    `w_${width}`,
  ].join(",");
  const remote = /^https?:\/\//.test(src);
  const type = remote ? "fetch" : "upload";
  const asset = remote ? encodeURIComponent(src) : src;
  return `https://res.cloudinary.com/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/${type}/${transforms}/${asset}`;
}

/** Anything that is not a URL is a bundled static import, which Next already serves locally. */
function isLocal(src: ImageSrc): boolean {
  const url = srcUrlSchema.safeParse(src);
  return !url.success || url.data.startsWith("/");
}

type BaseProps = {
  src: ImageSrc;
  alt: string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  onLoad?: ComponentProps<typeof NextImage>["onLoad"];
  onError?: ComponentProps<typeof NextImage>["onError"];
  className?: string;
};

type SizedProps = BaseProps & { width: number; height: number; fill?: never };
type FillProps = BaseProps & { fill: true; width?: never; height?: never };

export type ImageProps = SizedProps | FillProps;

export function Image({ src, className, onLoad, onError, ...rest }: ImageProps) {
  // An absent src otherwise renders <NextImage src="">, which the browser resolves to the current
  // page URL — a broken tile that never fires onError, so the overlay fallback below never shows.
  // Render the neutral fallback directly instead, matching ImageWithFallback's contract.
  if (!src) {
    return rest.fill ? (
      <ImageFallback className={cn("absolute inset-0", className)} />
    ) : (
      <ImageFallback className={className} style={{ width: rest.width, height: rest.height }} />
    );
  }

  const dynamic = !isLocal(src);
  const overlay = dynamic && rest.fill === true;
  const ref = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [revealed, setRevealed] = useState(false);
  /*
   * Whether the CDN has already failed for this source. Once it has, `unoptimized` makes Next skip
   * the loader entirely and render the origin URL. Cloudinary sits in front of every remote photo,
   * so anything that takes the whole cloud down — an exhausted quota disables it and answers 401
   * on every asset — leaves the site photoless while the origins are still serving fine.
   * Unoptimized bytes are the cheap degradation; a grey placeholder is not.
   */
  const [cdnFailed, setCdnFailed] = useState(false);

  useEffect(() => {
    setCdnFailed(false);
    setStatus("loading");
    setRevealed(false);
  }, [src]);

  /*
   * An image that finished before hydration never replays its load or error event, so its outcome
   * has to be read off the element. Kept separate from the reset above because it feeds `cdnFailed`
   * back in as a dependency, and resetting on that would loop.
   */
  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    if (img.naturalWidth > 0) setStatus("loaded");
    else if (dynamic && !cdnFailed) setCdnFailed(true);
    else setStatus("error");
  }, [src, dynamic, cdnFailed]);

  /*
   * Fade the loader out once the image is ready. A cached/priority image flips to loaded
   * before the browser paints, which skips the opacity transition (the image just pops in).
   * Reading a layout property flushes the opaque overlay first, so the fade always runs.
   */
  useEffect(() => {
    if (status !== "loaded") return;
    overlayRef.current?.getBoundingClientRect();
    setRevealed(true);
  }, [status]);

  const handleLoad: ComponentProps<typeof NextImage>["onLoad"] = (event) => {
    setStatus("loaded");
    onLoad?.(event);
  };
  // The first CDN failure is a retry, not an outcome, so `onError` stays unfired until the origin
  // has failed too — a consumer counting broken photos should not count the ones that recovered.
  const handleError: ComponentProps<typeof NextImage>["onError"] = (event) => {
    if (dynamic && !cdnFailed) {
      setCdnFailed(true);
      setStatus("loading");
      return;
    }
    setStatus("error");
    onError?.(event);
  };

  return (
    <>
      <NextImage
        ref={ref}
        src={src}
        loader={dynamic ? cloudinaryLoader : undefined}
        onLoad={handleLoad}
        onError={handleError}
        className={className}
        {...rest}
        unoptimized={rest.unoptimized || cdnFailed}
      />
      {overlay ? (
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-10 transition-opacity duration-500",
            revealed ? "opacity-0" : "opacity-100",
          )}
        >
          {status === "error" ? (
            <ImageFallback />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted">
              {status === "loading" ? (
                <Loader2 className="size-6 animate-spin text-natural-400" />
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
