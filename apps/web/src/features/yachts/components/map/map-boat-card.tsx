"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselBars,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Bookmark, Info, Sailboat, Star, Users } from "lucide-react";

import { Image } from "@/components/shared/image";

import type { Marina } from "../../types";
import type { BoatCardBadge } from "../search/boat-card";
import { MarinaPopover } from "../marina-popover";

/*
 * Figma "Boat Card" on the map list (node 960:346222): 288x468.
 */
export type MapBoatCardProps = {
  images: string[];
  imageAlt?: string;
  badges?: BoatCardBadge[];
  marina: Marina;
  name: string;
  rating: string;
  charterType: string;
  crew: string;
  priceLabel: string;
  price: string;
  perPerson: string;
  prepayment: string;
  className?: string;
};

export default function MapBoatCard({
  images,
  imageAlt,
  badges,
  marina,
  name,
  rating,
  charterType,
  crew,
  priceLabel,
  price,
  perPerson,
  prepayment,
  className,
}: MapBoatCardProps) {
  return (
    <article
      className={cn(
        "flex w-full flex-col gap-4 overflow-hidden rounded-2xl border border-natural-50 bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)]",
        className,
      )}
    >
      <div className="relative h-45 w-full shrink-0">
        <Carousel className="size-full">
          <CarouselViewport>
            {images.map((src, index) => (
              <CarouselSlide key={src + index}>
                <Image
                  src={src}
                  alt={index === 0 ? (imageAlt ?? "") : ""}
                  fill
                  sizes="288px"
                  className="object-cover"
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/10" />
          <CarouselBars className="absolute inset-x-0 bottom-4" />
        </Carousel>

        <div className="absolute inset-x-4 top-4 flex items-start gap-5">
          <div className="flex flex-1 flex-wrap items-start gap-1.5">
            {badges?.map((badge) => (
              <Chip
                key={badge.label}
                variant={badge.solid ? undefined : "brand"}
                className={cn(
                  "shadow-[4px_4px_15px_rgba(47,128,237,0.15)]",
                  badge.solid && "bg-brand text-brand-foreground",
                )}
              >
                {badge.icon}
                {badge.label}
              </Chip>
            ))}
          </div>
          <Button
            type="button"
            variant="subtle"
            size="icon-md"
            aria-label="Save to wishlist"
            className="shrink-0 bg-black/12 text-white hover:bg-black/25 hover:text-white focus-visible:ring-white/60"
          >
            <Bookmark />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={marina} />

          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-[22px] font-semibold leading-[1.3] text-foreground">
              {name}
            </h3>
            <Chip className="shrink-0 bg-transparent p-1.5 text-gold">
              <Star className="fill-current" />
              {rating}
            </Chip>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip variant="neutral">
              <Sailboat />
              {charterType}
            </Chip>
            <Chip variant="neutral">
              <Users />
              {crew}
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex w-full items-center gap-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium leading-[1.3] text-natural-500">
                {priceLabel}
              </span>
              <span className="text-[22px] font-semibold leading-[1.3] text-black">{price}</span>
            </div>
            <p className="shrink-0 text-sm font-medium leading-[1.3] text-natural-500">
              {perPerson}
            </p>
          </div>

          <button
            type="button"
            className="flex w-fit items-center gap-1 text-xs font-semibold leading-[1.3] text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Info className="size-4 shrink-0" />
            {prepayment}
          </button>
        </div>

        <Button variant="neutral" size="md" className="w-full capitalize">
          View Details
        </Button>
      </div>
    </article>
  );
}
