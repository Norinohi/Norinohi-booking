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

  /*
   * The main photo is the hero and the thumbs are its index, so they are sized apart: the photo
   * takes the column at 16:9 and the thumbs are a strip of small 16:9 tiles — the same crop, so a
   * thumb previews exactly the framing the click brings up. Widths are fixed on desktop and a
   * fraction of the column on phones so a partial tile always peeks past the edge as the cue that
   * the strip scrolls; the primitive keeps the active tile in view.
   */
  return (
    <Carousel className="flex flex-col gap-3 md:gap-4" options={{ loop: true }}>
      {/* Wider than 16:9 from a tablet up, where that shape pushed the thumbs below the fold;
          a phone keeps it, since 21:9 there is a 160px strip. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl md:aspect-[21/9]">
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
        {/* Not stretched: the bars window past a handful now, and each sets its own width. */}
        <CarouselBars className="absolute inset-x-0 bottom-4" />
      </div>

      <CarouselThumbs
        listClassName="gap-2 md:gap-3"
        itemClassName="basis-1/3 rounded-xl md:basis-44"
      >
        {photos.map((photo) => (
          <div key={photo.src} className="relative aspect-video w-full">
            <Image
              src={photo.src}
              alt=""
              fill
              sizes="(min-width: 768px) 176px, 33vw"
              className="object-cover"
            />
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
