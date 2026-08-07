"use client";

import { env } from "@yacht-charter/env/web";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Loader2 } from "lucide-react";
import NextImage, { type ImageLoaderProps } from "next/image";
import { type ComponentProps, useEffect, useRef, useState } from "react";

type ImageSrc = ComponentProps<typeof NextImage>["src"];

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

function isLocal(src: ImageSrc): boolean {
  return typeof src === "object" || src.startsWith("/");
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
  const dynamic = !isLocal(src);
  const overlay = dynamic && rest.fill === true;
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setStatus(img.naturalWidth > 0 ? "loaded" : "error");
  }, []);

  useEffect(() => {
    if (status !== "loaded") return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const handleLoad: ComponentProps<typeof NextImage>["onLoad"] = (event) => {
    setStatus("loaded");
    onLoad?.(event);
  };
  const handleError: ComponentProps<typeof NextImage>["onError"] = (event) => {
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
      />
      {overlay ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-muted transition-opacity duration-500",
            revealed ? "opacity-0" : "opacity-100",
          )}
        >
          {status === "loading" ? (
            <Loader2 className="size-6 animate-spin text-natural-400" />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
