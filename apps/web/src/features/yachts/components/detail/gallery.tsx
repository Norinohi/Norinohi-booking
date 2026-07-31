"use client";

import {
  Carousel,
  CarouselArrow,
  CarouselBars,
  CarouselSlide,
  CarouselThumbs,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import { Image } from "@/components/shared/image";

const PHOTOS = [
  { src: "/assets/yachts/gallery-1.jpg", alt: "Lagoon 42 anchored in a turquoise bay" },
  { src: "/assets/yachts/lagoon-42.jpg", alt: "Lagoon 42 under sail off the Dalmatian coast" },
  { src: "/assets/yachts/gallery-2.jpg", alt: "Lagoon 42 sailing with the spinnaker up" },
  { src: "/assets/yachts/gallery-3.jpg", alt: "Guests relaxing in the Lagoon 42 cockpit" },
  { src: "/assets/hero/hero-yacht.webp", alt: "Lagoon 42 moored at ACI Marina Split" },
];

const ARROW = "rounded-lg bg-black/12 text-white hover:bg-black/25 hover:text-white";

/*
 * Gallery — Figma node 967:69718. A 400px hero carousel (dark-12 arrows inset 32px, a 420px bar
 * strip pinned to the bottom) over a 334x200 thumbnail strip that overflows the 1042 column and
 * drags. Clicking the hero opens the full-size lightbox.
 */
export default function Gallery() {
  const t = useTranslations("YachtDetail");
  const [openAt, setOpenAt] = useState<number | null>(null);

  return (
    <Carousel className="flex flex-col gap-4 md:gap-6" options={{ loop: true }}>
      <div className="relative h-50 w-full overflow-hidden rounded-2xl md:h-100">
        <CarouselViewport>
          {PHOTOS.map((photo, index) => (
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
        listClassName="gap-4 md:gap-6"
        itemClassName="basis-83.5 rounded-2xl opacity-100"
      >
        {PHOTOS.map((photo) => (
          <div key={photo.src} className="relative h-37.5 w-full md:h-50">
            <Image src={photo.src} alt="" fill sizes="334px" className="object-cover" />
            <div aria-hidden className="absolute inset-0 bg-black/10" />
          </div>
        ))}
      </CarouselThumbs>

      <Lightbox
        open={openAt !== null}
        index={openAt ?? 0}
        close={() => setOpenAt(null)}
        slides={PHOTOS.map((photo) => ({ src: photo.src, alt: photo.alt }))}
        plugins={[Zoom, Thumbnails]}
        thumbnails={{ imageFit: "cover" }}
        labels={{
          Close: t("gallery.close"),
          Previous: t("gallery.previous"),
          Next: t("gallery.next"),
          "Zoom in": t("gallery.zoomIn"),
          "Zoom out": t("gallery.zoomOut"),
        }}
      />
    </Carousel>
  );
}
