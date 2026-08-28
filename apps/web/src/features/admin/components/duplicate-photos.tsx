"use client";

import {
  Carousel,
  CarouselArrow,
  CarouselSlide,
  CarouselThumbs,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Image } from "@/components/shared/data-display/image";

import type { DuplicatePhoto } from "../types";

/*
 * DuplicatePhotos — one side's whole photo set, in the order the catalogue ranks it
 * (main first, then galleries, then layouts). Two listings for the same yacht are
 * usually settled by the photos rather than the numbers, so this shows all of them:
 * arrows and a thumb strip to scan, and a click into the lightbox to see one full size.
 */

const GalleryLightbox = dynamic(() => import("@/components/shared/data-display/gallery-lightbox"), {
  ssr: false,
});

const ARROW = "bg-black/40 text-white hover:bg-black/60 hover:text-white";

function PhotoPosition({ total }: { total: number }) {
  const t = useTranslations("Admin.Duplicates");
  const { selected } = useCarousel();

  return (
    <span className="pointer-events-none absolute top-3 right-3 z-10 rounded-sm bg-black/55 px-2 py-1 text-sm leading-[1.15] font-semibold text-white">
      {t("photoPosition", { index: selected + 1, total })}
    </span>
  );
}

export default function DuplicatePhotos({
  photos,
  title,
  thumbs = false,
}: {
  photos: readonly DuplicatePhoto[];
  title: string;
  /** The queue card has no room for the strip; the details dialog does. */
  thumbs?: boolean;
}) {
  const t = useTranslations("Admin.Duplicates");
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-md bg-natural-50 text-natural-500">
        <ImageOff className="size-6" />
        <span className="text-sm font-medium">{t("noImage")}</span>
      </div>
    );
  }

  return (
    <Carousel className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-natural-50">
        <CarouselViewport>
          {photos.map((photo, index) => (
            <CarouselSlide key={`${photo.url}-${index}`}>
              <button
                type="button"
                aria-label={t("openPhoto", { index: index + 1 })}
                onClick={() => setOpenAt(index)}
                className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset"
              >
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 400px, 100vw"
                  className="object-cover"
                />
              </button>
            </CarouselSlide>
          ))}
        </CarouselViewport>

        <PhotoPosition total={photos.length} />
        <CarouselArrow direction="prev" className={ARROW} />
        <CarouselArrow direction="next" className={ARROW} />
      </div>

      {thumbs ? (
        <CarouselThumbs listClassName="gap-2" itemClassName="basis-1/5 rounded-md">
          {photos.map((photo, index) => (
            <div key={`${photo.url}-thumb-${index}`} className="relative aspect-[4/3] w-full">
              <Image src={photo.url} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ))}
        </CarouselThumbs>
      ) : null}

      {openAt !== null && (
        <GalleryLightbox
          openAt={openAt}
          onClose={() => setOpenAt(null)}
          slides={photos.map((photo) => ({ src: photo.url, alt: title }))}
        />
      )}
    </Carousel>
  );
}
