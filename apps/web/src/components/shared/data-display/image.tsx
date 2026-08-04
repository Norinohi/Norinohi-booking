import { env } from "@yacht-charter/env/web";
import NextImage, { type ImageLoaderProps } from "next/image";
import type { ComponentProps } from "react";

type ImageSrc = ComponentProps<typeof NextImage>["src"];

function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  const transforms = [
    "f_auto",
    `q_auto${quality ? `:${quality}` : ""}`,
    "c_limit",
    `w_${width}`,
  ].join(",");
  return `https://res.cloudinary.com/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${transforms}/${src}`;
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
  /** Required for SVG — the Next optimizer rejects it without `dangerouslyAllowSVG`. */
  unoptimized?: boolean;
  className?: string;
};

type SizedProps = BaseProps & { width: number; height: number; fill?: never };
type FillProps = BaseProps & { fill: true; width?: never; height?: never };

export type ImageProps = SizedProps | FillProps;

export function Image({ src, ...props }: ImageProps) {
  return <NextImage src={src} loader={isLocal(src) ? undefined : cloudinaryLoader} {...props} />;
}
