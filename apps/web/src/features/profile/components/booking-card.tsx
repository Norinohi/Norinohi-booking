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
import { ArrowRight, Bookmark, Sailboat, Star, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { Image } from "@/components/shared/data-display/image";
import { type Marina, MarinaPopover } from "@/components/shared/overlay/marina-popover";

/*
 * BookingCard — Figma "My bookings / Boat Card" (972:54753). A horizontal history card:
 * image (carousel + bookmark) | info (marina, name + rating, charter/crew chips, charter dates,
 * price) | View Details. Below xl it stacks (image on top), mirroring the search BoatCard's
 * responsive philosophy. Simpler than the search card — no specs, amenities, prepayment or
 * per-person; the price sits inside the info column.
 */

const FORMATS = {
  day: { day: "numeric", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
} as const;

/* TODO: every card opens the same hardcoded detail page until bookings carry a real listing id. */
const DETAIL_HREF = "/yachts/lagoon-42";

export type BookingCardProps = {
  images: string[];
  imageAlt?: string;
  marina: Marina;
  name: string;
  rating: string;
  charterType: string;
  crew: string;
  start: string;
  end: string;
  timeZone: string;
  price: string;
  priority?: boolean;
  className?: string;
};

function Stamp({ value, timeZone }: { value: string; timeZone: string }) {
  const format = useFormatter();
  const at = new Date(value);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold leading-[1.3] text-foreground">
        {format.dateTime(at, { ...FORMATS.day, timeZone })}
      </span>
      <span className="text-sm font-medium leading-[1.3] text-natural-500">
        {format.dateTime(at, { ...FORMATS.time, timeZone })}
      </span>
    </div>
  );
}

export default function BookingCard({ className, priority, ...booking }: BookingCardProps) {
  const t = useTranslations("Common.boatCard");

  return (
    <article
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-natural-100 bg-card xl:grid xl:grid-cols-[minmax(0,452px)_minmax(0,1fr)_auto] xl:items-stretch xl:gap-6",
        className,
      )}
    >
      {/* Image */}
      <div className="relative h-56 w-full overflow-hidden rounded-t-2xl md:h-64 xl:h-auto xl:rounded-tr-none xl:rounded-bl-2xl">
        <Carousel className="size-full">
          <CarouselViewport>
            {booking.images.map((src, index) => (
              <CarouselSlide key={src + index}>
                <Image
                  src={src}
                  alt={index === 0 ? (booking.imageAlt ?? "") : ""}
                  fill
                  priority={priority && index === 0}
                  sizes="(min-width: 1280px) 30vw, 100vw"
                  className="object-cover"
                />
              </CarouselSlide>
            ))}
          </CarouselViewport>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/10" />
          <CarouselBars className="absolute inset-x-0 bottom-4" />
        </Carousel>

        <div className="absolute top-4 left-4">
          <Button
            type="button"
            variant="subtle"
            size="icon-md"
            aria-label={t("save")}
            className="bg-black/12 text-white hover:bg-black/25 hover:text-white focus-visible:ring-white/60"
          >
            <Bookmark />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-4 md:px-6 md:pt-6 xl:border-r xl:border-natural-50 xl:px-0 xl:py-6 xl:pr-6">
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={booking.marina} />

          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[28px] font-medium leading-[1.1] text-foreground md:text-[32px]">
              {booking.name}
            </h3>
            <Chip className="shrink-0 bg-transparent p-1.5 text-gold">
              <Star className="fill-current" />
              {booking.rating}
            </Chip>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip variant="neutral">
              <Sailboat />
              {booking.charterType}
            </Chip>
            <Chip variant="neutral">
              <Users />
              {booking.crew}
            </Chip>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Stamp value={booking.start} timeZone={booking.timeZone} />
          <ArrowRight className="size-4 shrink-0 text-foreground" />
          <Stamp value={booking.end} timeZone={booking.timeZone} />
        </div>

        <p className="text-[42px] font-bold leading-[1.15] text-black">{booking.price}</p>
      </div>

      {/* Action */}
      <div className="flex items-center justify-center px-4 pb-4 md:px-6 md:pb-6 xl:px-0 xl:py-6 xl:pr-6">
        <Button
          variant="neutral"
          size="md"
          nativeButton={false}
          render={<Link href={DETAIL_HREF} />}
          className="w-full capitalize xl:w-auto"
        >
          {t("viewDetails")}
        </Button>
      </div>
    </article>
  );
}
