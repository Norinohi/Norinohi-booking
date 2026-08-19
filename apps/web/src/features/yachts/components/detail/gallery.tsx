"use client";

import {
  Carousel,
  CarouselArrow,
  CarouselBars,
  CarouselSlide,
  CarouselThumbs,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Image } from "@/components/shared/data-display/image";

import { useListingDetail } from "../../hooks/use-listing-detail";

const ARROW = "rounded-lg bg-black/12 text-white hover:bg-black/25 hover:text-white";

/*
 * The lightbox plus its plugins and stylesheets is a meaningful chunk that most visitors never
 * open, so it is fetched on the first photo click instead of with the page. `ssr: false` because
 * it renders nothing until opened — there is no shell content to lose.
 */
const GalleryLightbox = dynamic(() => import("@/components/shared/data-display/gallery-lightbox"), {
  ssr: false,
});

export default function Gallery() {
  const { data } = useListingDetail();
  const [openAt, setOpenAt] = useState<number | null>(null);

  if (!data) return null;

  const sources = data.gallery.length ? data.gallery : [data.mainImage];
  const photos = sources.map((src) => ({ src, alt: data.title }));

  return (
    <Carousel className="flex flex-col gap-4 md:gap-6" options={{ loop: true }}>
      <div className="relative h-50 w-full overflow-hidden rounded-2xl md:h-100">
        <CarouselViewport>
          {photos.map((photo, index) => (
            <CarouselSlide key={photo.src}>
              <button
                type="button"
                aria-label={photo.alt}
                onClick={() => setOpenAt(index)}
                className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset"
              >
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  priority={index === 0}
                  sizes="(min-width: 1280px) 1042px, 100vw"
                  className="object-cover"
                />
              </button>
            </CarouselSlide>
          ))}
        </CarouselViewport>

        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/10" />

        <CarouselArrow direction="prev" className={`left-4 md:left-8 ${ARROW}`} />
        <CarouselArrow direction="next" className={`right-4 md:right-8 ${ARROW}`} />
        <CarouselBars
          className="absolute inset-x-4 bottom-4 mx-auto max-w-105 md:inset-x-0"
          barClassName="w-auto flex-1"
        />
      </div>

      <CarouselThumbs
        listClassName="gap-2 md:gap-6"
        itemClassName="basis-1/3 md:basis-83.5 rounded-2xl"
      >
        {photos.map((photo) => (
          <div key={photo.src} className="relative h-20 w-full md:h-50">
            <Image
              src={photo.src}
              alt=""
              fill
              sizes="(min-width: 768px) 334px, 33vw"
              className="object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-black/10" />
          </div>
        ))}
      </CarouselThumbs>

      {openAt !== null && (
        <GalleryLightbox
          openAt={openAt}
          onClose={() => setOpenAt(null)}
          slides={photos.map((photo) => ({ src: photo.src, alt: photo.alt }))}
        />
      )}
    </Carousel>
  );
}
