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
import Link from "next/link";

/*
 * PopularDestinations — Figma "Main Page" › Popular Destinations (node 530:3213). A left-aligned
 * H2 with prev/next arrows on the right, a swipeable row of DestinationCards, and a centered
 * "See All Destinations" CTA. Client component: the header arrows drive the shared Embla-based
 * Carousel through useCarousel. Cards peek past the container edge and clip at the viewport.
 */
const DESTINATIONS: { image: string; imageAlt: string; title: string; subtitle: string }[] = [
  {
    image: "/assets/home/destinations/croatia.webp",
    imageAlt: "Turquoise cliff-lined cove on the Croatian coast",
    title: "Croatia",
    subtitle: "From €350 / per person",
  },
  {
    image: "/assets/home/destinations/greece.webp",
    imageAlt: "Colourful harbour village on a Greek island",
    title: "Greece",
    subtitle: "From €500 / per person",
  },
  {
    image: "/assets/home/destinations/caribbean.webp",
    imageAlt: "Aerial view of a tropical Caribbean island beach",
    title: "Caribbean",
    subtitle: "From €800 / per person",
  },
  {
    image: "/assets/home/destinations/italy.webp",
    imageAlt: "Cliffside town along the Amalfi Coast in Italy",
    title: "Italy",
    subtitle: "From €600 / per person",
  },
  {
    image: "/assets/home/destinations/croatia.webp",
    imageAlt: "Sheltered Adriatic bay on the Montenegrin coast",
    title: "Montenegro",
    subtitle: "From €390 / per person",
  },
];

function NavArrows() {
  const { api, canScrollPrev, canScrollNext } = useCarousel();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label="Previous destinations"
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label="Next destinations"
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export default function PopularDestinations() {
  return (
    <section className="w-full">
      <div className="mx-auto max-w-[1536px] py-[60px] md:pt-[70px] md:pb-[50px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <Carousel options={{ align: "start" }} className="flex flex-col gap-8 2xl:gap-10">
          <div className="flex items-center justify-between gap-4 px-4 md:px-[54px] 2xl:px-[70px]">
            <h2 className="text-h2 text-foreground">Popular Destinations</h2>
            <NavArrows />
          </div>

          <CarouselViewport className="pl-4 md:pl-[54px] 2xl:pl-[70px]">
            {DESTINATIONS.map((destination) => (
              <CarouselSlide
                key={destination.title}
                className="basis-[85%] pr-5 sm:basis-1/2 md:basis-[420px] lg:basis-1/3 2xl:basis-[420px]"
              >
                <DestinationCard
                  image={destination.image}
                  imageAlt={destination.imageAlt}
                  title={destination.title}
                  subtitle={destination.subtitle}
                  className="w-full"
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>

          <div className="flex justify-center px-4 md:px-[54px] 2xl:px-[70px]">
            <Button
              variant="neutral"
              size="md"
              nativeButton={false}
              render={<Link href="/yachts" />}
            >
              See All Destinations
              <ArrowUpRight />
            </Button>
          </div>
        </Carousel>
      </div>
    </section>
  );
}
