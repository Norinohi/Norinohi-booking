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
import { MarinaPopover } from "../marina-popover";
import type { BoatCardBadge } from "../search/boat-card";

/*
 * Figma "Boat Card" — two variants of one component.
 * `stacked` (node 960:346222) is 288x468 in the list column.
 * `row` (node 960:346082) is 601 wide over a marker: image on the left, a step larger
 * type, and the per-person line moved onto its own row.
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
  layout?: "stacked" | "row";
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
  layout = "stacked",
  className,
}: MapBoatCardProps) {
  const isRow = layout === "row";

  return (
    <article
      className={cn(
        "flex rounded-2xl border border-natural-50 bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)]",
        isRow ? "w-150.25 max-w-[calc(100vw-2rem)] gap-4" : "w-full flex-col gap-4",
        className,
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden",
          isRow ? "w-74 rounded-l-2xl" : "h-45 w-full rounded-t-2xl",
        )}
      >
        <Carousel className="size-full">
          <CarouselViewport>
            {images.map((src, index) => (
              <CarouselSlide key={src + index}>
                <Image
                  src={src}
                  alt={index === 0 ? (imageAlt ?? "") : ""}
                  fill
                  sizes={isRow ? "296px" : "288px"}
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

      <div className={cn("flex flex-col gap-4", isRow ? "min-w-0 flex-1 py-6 pr-4" : "px-4 pb-4")}>
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={marina} />

          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "min-w-0 truncate font-semibold leading-[1.3] text-foreground",
                isRow ? "text-2xl" : "text-[22px]",
              )}
            >
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
          <div className={cn("flex w-full gap-1.5", isRow ? "flex-col" : "items-center")}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium leading-[1.3] text-natural-500">
                {priceLabel}
              </span>
              <span
                className={cn(
                  "text-black",
                  isRow
                    ? "text-[32px] font-bold leading-[1.1]"
                    : "text-[22px] font-semibold leading-[1.3]",
                )}
              >
                {price}
              </span>
            </div>
            <p
              className={cn(
                "text-sm font-medium leading-[1.3] text-natural-500",
                !isRow && "shrink-0",
              )}
            >
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
