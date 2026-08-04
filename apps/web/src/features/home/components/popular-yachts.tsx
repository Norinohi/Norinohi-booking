"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
import {
  Carousel,
  CarouselSlide,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import { Anchor, ArrowUpRight, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { motion } from "motion/react";
import type { Route } from "next";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { RISE, VIEWPORT } from "@/lib/motion";

/* Yacht names are proper nouns and stay in code; every other visible string comes from messages. */
/* TODO: every card opens the same hardcoded detail page until listings carry a real id. */
const DETAIL_HREF = "/yachts/lagoon-42" as Route;

const POPULAR_YACHTS = [
  {
    key: "lagoon42",
    image: "/assets/home/popular/catamaran.webp",
    title: "Lagoon 42",
    rating: 4.9,
    price: 350,
  },
  {
    key: "bavariaC42",
    image: "/assets/home/popular/sailing-yacht.webp",
    title: "Bavaria C42",
    rating: 4.8,
    price: 280,
  },
  {
    key: "sunseeker65",
    image: "/assets/home/popular/motor-yacht.webp",
    title: "Sunseeker 65",
    rating: 5.0,
    price: 520,
  },
  {
    key: "bali46",
    image: "/assets/home/popular/catamaran-flag.webp",
    title: "Bali 4.6",
    rating: 4.9,
    price: 410,
  },
  {
    key: "fountainePajot45",
    image: "/assets/yachts/lagoon-42.jpg",
    title: "Fountaine Pajot 45",
    rating: 4.7,
    price: 390,
  },
] as const;

function CarouselNav() {
  const t = useTranslations("Home.PopularYachts");
  const { api, canScrollPrev, canScrollNext } = useCarousel();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <IconButton
        variant="neutral"
        size="sm"
        aria-label={t("previous")}
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        variant="neutral"
        size="sm"
        aria-label={t("next")}
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}

export default function PopularYachts() {
  const t = useTranslations("Home.PopularYachts");
  const tCard = useTranslations("Common.boatCard");
  const format = useFormatter();
  const tags = [
    { label: t("tags.bareboat"), icon: <Anchor /> },
    { label: t("tags.fullCrew"), icon: <Users /> },
  ];

  return (
    <section className="bg-brand-50">
      <div className="mx-auto max-w-384 px-4 pt-10 pb-10 md:px-13.5 md:pt-17.5 md:pb-17.25 xl:px-17.5 xl:pt-25 xl:pb-25">
        <Carousel options={{ align: "start", containScroll: "trimSnaps" }}>
          <motion.div
            variants={RISE}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT}
            className="mb-8 flex flex-col items-center gap-4 md:flex-row md:justify-between xl:mb-10"
          >
            <h2 className="text-[40px] leading-[1.1] font-medium md:text-[50px]">{t("heading")}</h2>
            <CarouselNav />
          </motion.div>

          <CarouselViewport>
            {POPULAR_YACHTS.map((yacht) => (
              <CarouselSlide key={yacht.key} className="basis-85.5 pr-2 md:basis-88.5 md:pr-5">
                <BoatSmallCard
                  className="w-full"
                  image={yacht.image}
                  imageAlt={t(`items.${yacht.key}.imageAlt`)}
                  saveLabel={tCard("save")}
                  location={t(`items.${yacht.key}.location`)}
                  title={yacht.title}
                  rating={yacht.rating}
                  tags={tags}
                  price={format.number(yacht.price, "eur")}
                  priceSuffix={t("perDay")}
                  priceLabel={t("from")}
                  actionLabel={t("viewDetails")}
                  actionRender={<Link href={DETAIL_HREF} />}
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>
        </Carousel>

        <div className="mt-8 flex justify-center xl:mt-10">
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
      </div>
    </section>
  );
}
