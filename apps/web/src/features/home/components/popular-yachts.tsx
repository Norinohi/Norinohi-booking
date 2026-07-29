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
import Link from "next/link";

/*
 * PopularYachts — Figma "Main Page" section (node 605:4015). A brand-50 wash band: a large
 * "Popular Yachts" heading with prev/next arrows to its right, a swipeable carousel of five
 * BoatSmallCards (reuses data-display/carousel + data-display/card-boat-small), and a centered
 * "See All Yachts" link (node 845:196378) below. Content is static sample data; View Details
 * has no target yet (TODO: wire to the yacht-detail route once it exists).
 */

type PopularYacht = {
  id: string;
  image: string;
  imageAlt: string;
  location: string;
  title: string;
  rating: number;
  price: string;
};

const TAGS = [
  { label: "Bareboat", icon: <Anchor /> },
  { label: "Full crew", icon: <Users /> },
];

const POPULAR_YACHTS: PopularYacht[] = [
  {
    id: "lagoon-42",
    image: "/assets/home/popular/catamaran.webp",
    imageAlt: "Lagoon 42 catamaran moored off Split",
    location: "Split, Croatia",
    title: "Lagoon 42",
    rating: 4.9,
    price: "€350",
  },
  {
    id: "bavaria-c42",
    image: "/assets/home/popular/sailing-yacht.webp",
    imageAlt: "Bavaria C42 sailing yacht near Athens",
    location: "Athens, Greece",
    title: "Bavaria C42",
    rating: 4.8,
    price: "€280",
  },
  {
    id: "sunseeker-65",
    image: "/assets/home/popular/motor-yacht.webp",
    imageAlt: "Sunseeker 65 motor yacht cruising off Ibiza",
    location: "Ibiza, Spain",
    title: "Sunseeker 65",
    rating: 5.0,
    price: "€520",
  },
  {
    id: "bali-46",
    image: "/assets/home/popular/catamaran-flag.webp",
    imageAlt: "Bali 4.6 catamaran anchored near Palma",
    location: "Palma, Spain",
    title: "Bali 4.6",
    rating: 4.9,
    price: "€410",
  },
  {
    id: "fountaine-pajot-45",
    image: "/assets/yachts/lagoon-42.jpg",
    imageAlt: "Fountaine Pajot 45 catamaran off Dubrovnik",
    location: "Dubrovnik, Croatia",
    title: "Fountaine Pajot 45",
    rating: 4.7,
    price: "€390",
  },
];

function CarouselNav() {
  const { api, canScrollPrev, canScrollNext } = useCarousel();
  return (
    <div className="flex shrink-0 items-center gap-2">
      <IconButton
        variant="neutral"
        size="sm"
        aria-label="Previous yachts"
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        variant="neutral"
        size="sm"
        aria-label="Next yachts"
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}

export default function PopularYachts() {
  return (
    <section className="bg-brand-50">
      <div className="mx-auto max-w-[1536px] px-4 py-[60px] md:px-[54px] md:pt-[70px] md:pb-[69px] 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[100px]">
        <Carousel options={{ align: "start", containScroll: "trimSnaps" }}>
          <div className="mb-8 flex items-center justify-between gap-4 2xl:mb-10">
            <h2 className="text-[32px] leading-[1.1] font-medium md:text-[50px] 2xl:text-[50px]">
              Popular Yachts
            </h2>
            <CarouselNav />
          </div>

          <CarouselViewport>
            {POPULAR_YACHTS.map((yacht) => (
              <CarouselSlide
                key={yacht.id}
                className="basis-[280px] pr-4 md:basis-[354px] md:pr-5 2xl:basis-[354px] 2xl:pr-5"
              >
                <BoatSmallCard
                  className="w-full"
                  image={yacht.image}
                  imageAlt={yacht.imageAlt}
                  location={yacht.location}
                  title={yacht.title}
                  rating={yacht.rating}
                  tags={TAGS}
                  price={yacht.price}
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>
        </Carousel>

        <div className="mt-8 flex justify-center 2xl:mt-10">
          <Button variant="neutral" size="md" nativeButton={false} render={<Link href="/yachts" />}>
            See All Yachts
            <ArrowUpRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
