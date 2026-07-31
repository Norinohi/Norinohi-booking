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
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { RISE, VIEWPORT } from "@/lib/motion";

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

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("previous")}
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("next")}
        disabled={!canScrollNext}
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
      <div className="mx-auto max-w-384 pt-10 pb-8 md:pt-17.5 md:pb-12.5 xl:pt-25 xl:pb-15">
        <Carousel options={{ align: "start" }} className="flex flex-col gap-8 xl:gap-10">
          <motion.div
            variants={RISE}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT}
            className="flex items-center justify-between gap-4 px-4 md:px-13.5 xl:px-17.5"
          >
            <h2 className="text-h2 text-foreground">{t("heading")}</h2>
            <NavArrows />
          </motion.div>

          <CarouselViewport className="pl-4 md:pl-13.5 xl:pl-17.5">
            {DESTINATIONS.map((destination) => (
              <CarouselSlide
                key={destination.key}
                className="basis-[85%] pr-5 sm:basis-1/2 md:basis-105 lg:basis-1/3 xl:basis-105"
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

          <div className="flex justify-center px-4 md:px-13.5 xl:px-17.5">
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
