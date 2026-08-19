"use client";

import {
  Carousel,
  CarouselBars,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { ImageFallback } from "@yacht-charter/ui/components/data-display/image-fallback";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Image } from "@/components/shared/data-display/image";

/*
 * Same viewer the listing page opens, imported the same way and for the same reason: the lightbox
 * with its two plugins and two stylesheets is a chunk most visitors never need, and a results page
 * holds twenty cards. Fetched on the first photo click, not with the list.
 */
const GalleryLightbox = dynamic(() => import("./gallery-lightbox"), { ssr: false });

/**
 * One boat's photos on a card: the slider, and the gallery a click on it opens.
 *
 * The three cards that show a boat — search, map, My Bookings — each had their own copy of this
 * block, identical but for the `sizes` hint. One copy means the gallery works the same on all
 * three rather than on whichever was remembered.
 *
 * Deliberately not used by the "popular yachts" and "destinations" carousels: those slide between
 * *cards*, one boat each, so there is no set of photos to open.
 *
 * `sizes` stays a prop rather than a default because it describes the slot the card gives the
 * photo, which differs per card and is what Next picks the source width from.
 */
export default function CardPhotos({
  images,
  imageAlt,
  sizes,
  priority,
}: {
  images: string[];
  imageAlt?: string;
  sizes: string;
  priority?: boolean;
}) {
  const t = useTranslations("Common.boatCard");
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (images.length === 0) return <ImageFallback className="absolute inset-0" />;

  return (
    <>
      <Carousel className="size-full">
        <CarouselViewport>
          {images.map((src, index) => (
            <CarouselSlide key={src + index}>
              {/* A full-bleed hit area over the photo, so a plain button rather than `Button`. */}
              <button
                type="button"
                aria-label={t("openGallery")}
                onClick={() => setOpenAt(index)}
                className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset"
              >
                <Image
                  src={src}
                  alt={index === 0 ? (imageAlt ?? "") : ""}
                  fill
                  priority={priority && index === 0}
                  sizes={sizes}
                  className="object-cover"
                />
              </button>
            </CarouselSlide>
          ))}
        </CarouselViewport>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/10" />
        <CarouselBars className="absolute inset-x-0 bottom-4" />
      </Carousel>

      {openAt !== null && (
        <GalleryLightbox
          openAt={openAt}
          onClose={() => setOpenAt(null)}
          slides={images.map((src) => ({ src, alt: imageAlt ?? "" }))}
        />
      )}
    </>
  );
}
