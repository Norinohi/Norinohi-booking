"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselSlide,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import { DestinationCard } from "@yacht-charter/ui/components/data-display/card-destination";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

/*
 * PopularDestinations — Figma "Main Page" › Popular Destinations (node 530:3213). A left-aligned
 * H2 with prev/next arrows on the right, a swipeable row of DestinationCards, and a centered
 * "See All Destinations" CTA. Client component: the header arrows drive the shared Embla-based
 * Carousel through useCarousel. Cards peek past the container edge and clip at the viewport.
 */
const DESTINATIONS = [
  { key: "croatia", image: "/assets/home/destinations/croatia.webp", fromPrice: 350 },
  { key: "greece", image: "/assets/home/destinations/greece.webp", fromPrice: 500 },
  { key: "caribbean", image: "/assets/home/destinations/caribbean.webp", fromPrice: 800 },
  { key: "italy", image: "/assets/home/destinations/italy.webp", fromPrice: 600 },
  { key: "montenegro", image: "/assets/home/destinations/croatia.webp", fromPrice: 390 },
] as const;

function NavArrows() {
  const t = useTranslations("Home.PopularDestinations");
  const { api, canScrollPrev, canScrollNext } = useCarousel();
  // On mobile the carousel is replaced by a vertical stack (hidden), so Embla reports
  // no scroll in either direction. Treat "can't scroll either way" as inactive and keep
  // the arrows in their normal (enabled) state — the design shows them dark, not greyed.
  const inactive = !canScrollPrev && !canScrollNext;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("previous")}
        disabled={!inactive && !canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("next")}
        disabled={!inactive && !canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export default function PopularDestinations() {
  const t = useTranslations("Home.PopularDestinations");
  const format = useFormatter();

  return (
    <section className="w-full">
      <div className="mx-auto pt-10 pb-8 md:pt-[70px] md:pb-[50px] xl:pt-[100px] xl:pb-[60px]">
        <Carousel options={{ align: "start" }} className="flex flex-col gap-8 xl:gap-10">
          <div className="flex items-center justify-between gap-4 px-4 md:px-[54px] xl:px-[70px]">
            <h2 className="text-h2 text-foreground">{t("heading")}</h2>
            <NavArrows />
          </div>

          {/* Mobile: vertical stack of all cards (design 959:317242) */}
          <div className="flex flex-col gap-4 px-4 md:hidden">
            {DESTINATIONS.map((destination) => (
              <DestinationCard
                key={destination.key}
                image={destination.image}
                imageAlt={t(`items.${destination.key}.imageAlt`)}
                title={t(`items.${destination.key}.title`)}
                subtitle={t("fromPerPerson", {
                  price: format.number(destination.fromPrice, "eur"),
                })}
                className="w-full"
              />
            ))}
          </div>

          {/* Tablet and up: swipeable carousel */}
          <CarouselViewport className="hidden pl-4 md:block md:pl-[54px] xl:pl-[70px]">
            {DESTINATIONS.map((destination) => (
              <CarouselSlide
                key={destination.key}
                className="basis-[85%] pr-5 sm:basis-1/2 md:basis-[420px] lg:basis-1/3 xl:basis-[420px]"
              >
                <DestinationCard
                  image={destination.image}
                  imageAlt={t(`items.${destination.key}.imageAlt`)}
                  title={t(`items.${destination.key}.title`)}
                  subtitle={t("fromPerPerson", {
                    price: format.number(destination.fromPrice, "eur"),
                  })}
                  className="w-full"
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>

          <div className="flex justify-center px-4 md:px-[54px] xl:px-[70px]">
            <Button
              variant="neutral"
              size="md"
              className="w-full md:w-auto"
              nativeButton={false}
              render={<Link href="/yachts" />}
            >
              {t("seeAll")}
              <ArrowUpRight />
            </Button>
          </div>
        </Carousel>
      </div>
    </section>
  );
}
