"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
import {
  Carousel,
  CarouselSlide,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import {
  PaginationNext,
  PaginationPrevious,
} from "@yacht-charter/ui/components/navigation/pagination";
import { Anchor, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import DetailSection from "./detail-section";

const YACHTS = [
  {
    name: "Bavaria C42",
    location: "Split, Croatia",
    image: "/assets/home/popular/sailing-yacht.webp",
    rating: 5.9,
    price: "€350",
  },
  {
    name: "Sunseeker 65",
    location: "Athens, Greece",
    image: "/assets/home/popular/motor-yacht.webp",
    rating: 5.9,
    price: "€550",
  },
  {
    name: "Bali 4.6",
    location: "Ibiza, Spain",
    image: "/assets/home/popular/catamaran-flag.webp",
    rating: 5.9,
    price: "€310",
  },
  {
    name: "Fountaine Pajot 45",
    location: "Palma, Spain",
    image: "/assets/home/popular/catamaran.webp",
    rating: 5.8,
    price: "€410",
  },
  {
    name: "Dufour 470",
    location: "Göcek, Türkiye",
    image: "/assets/yachts/gallery-2.jpg",
    rating: 5.7,
    price: "€290",
  },
] as const;

function CarouselNav() {
  const t = useTranslations("YachtDetail");
  const { api, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <div className="flex shrink-0 items-center gap-3">
      <PaginationPrevious
        aria-label={t("popular.previous")}
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      />
      <PaginationNext
        aria-label={t("popular.next")}
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      />
    </div>
  );
}

export default function PopularYachtsSection() {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tags = [
    { label: tCard("charterTypes.bareboat"), icon: <Anchor /> },
    { label: tCard("crews.fullCrew"), icon: <Users /> },
  ];

  return (
    <DetailSection id="popular-yachts" title={t("sections.popularYachts")}>
      <Carousel options={{ align: "start", containScroll: "trimSnaps" }} className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <CarouselNav />
          <Button
            variant="neutral"
            nativeButton={false}
            render={<Link href="/yachts" />}
            className="capitalize"
          >
            {t("popular.seeAll")}
          </Button>
        </div>

        <CarouselViewport>
          {YACHTS.map((yacht) => (
            <CarouselSlide key={yacht.name} className="basis-[350px] pr-4">
              <BoatSmallCard
                className="w-full"
                image={yacht.image}
                imageAlt={tCard("imageAlt", { name: yacht.name, marina: yacht.location })}
                saveLabel={tCard("save")}
                location={yacht.location}
                title={yacht.name}
                rating={yacht.rating}
                tags={tags}
                price={yacht.price}
                priceSuffix={t("popular.perPerson")}
                priceLabel={t("popular.from")}
                actionLabel={tCard("viewDetails")}
              />
            </CarouselSlide>
          ))}
        </CarouselViewport>
      </Carousel>
    </DetailSection>
  );
}
