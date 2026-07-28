import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselBars,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, Bookmark, Check, Info, Sailboat, Star, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Image } from "@/components/shared/image";

export type BoatCardBadge = { label: string; icon?: ReactNode; solid?: boolean };
export type BoatCardSpec = { label: string; value: string };
export type BoatCardAmenity = { icon: ReactNode; label: string };
export type BoatCardMoment = { date: string; time: string };

export type BoatCardProps = {
  images: string[];
  imageAlt?: string;
  badges?: BoatCardBadge[];
  location: string;
  name: string;
  rating: string;
  charterType: string;
  crew: string;
  specs: BoatCardSpec[];
  amenities?: BoatCardAmenity[];
  stats?: string[];
  start: BoatCardMoment;
  end: BoatCardMoment;
  priceLabel: string;
  price: string;
  perPerson: string;
  prepayment: string;
  className?: string;
};

function Gallery({
  images,
  imageAlt,
  badges,
}: Pick<BoatCardProps, "images" | "imageAlt" | "badges">) {
  return (
    <div className="relative h-64 w-full shrink-0 overflow-hidden rounded-t-2xl xl:h-auto xl:w-[452px] xl:rounded-tr-none xl:rounded-bl-2xl">
      <Carousel className="size-full">
        <CarouselViewport>
          {images.map((src, index) => (
            <CarouselSlide key={src + index}>
              <Image
                src={src}
                alt={index === 0 ? (imageAlt ?? "") : ""}
                fill
                priority={index === 0}
                sizes="(min-width: 1280px) 452px, 100vw"
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
  );
}

function Details({
  location,
  name,
  rating,
  charterType,
  crew,
  specs,
  amenities,
}: Pick<
  BoatCardProps,
  "location" | "name" | "rating" | "charterType" | "crew" | "specs" | "amenities"
>) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-6 md:px-6 xl:w-83.5 xl:shrink-0 xl:border-r xl:border-natural-50 xl:px-0 xl:pl-0">
      <div className="flex flex-col gap-3">
        <p className="truncate text-base font-bold leading-[1.4] text-foreground underline decoration-dotted">
          {location}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate pb-1 text-[32px] font-medium leading-[1.1] text-foreground">
            {name}
          </h3>
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            {rating}
          </Chip>
          <div className="flex items-center gap-1.5 md:ml-2 xl:ml-0 xl:hidden">
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

        <div className="hidden items-center gap-1.5 xl:flex">
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

      <div className="flex flex-wrap items-start gap-1.5">
        {specs.map((spec) => (
          <span
            key={spec.label}
            className="inline-flex items-center gap-1 rounded-sm p-1 text-sm font-medium leading-[1.3] text-natural-500"
          >
            <Check className="size-4 shrink-0" />
            {spec.label}: <span className="text-foreground">{spec.value}</span>
          </span>
        ))}
      </div>

      {amenities?.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-6">
          {amenities.map((amenity) => (
            <div key={amenity.label} className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand [&_svg]:size-4">
                {amenity.icon}
              </span>
              <span className="text-xs font-semibold leading-[1.3] text-foreground">
                {amenity.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Moment({ moment, className }: { moment: BoatCardMoment; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold leading-[1.3] text-foreground">{moment.date}</span>
      <span className="text-sm font-medium leading-[1.3] text-natural-500">{moment.time}</span>
    </div>
  );
}

function Action({
  stats,
  start,
  end,
  priceLabel,
  price,
  perPerson,
  prepayment,
}: Pick<
  BoatCardProps,
  "stats" | "start" | "end" | "priceLabel" | "price" | "perPerson" | "prepayment"
>) {
  return (
    <div className="flex flex-col gap-4 border-t border-natural-50 px-4 pt-6 pb-6 md:grid md:grid-cols-2 md:gap-x-4 md:px-6 xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:border-t-0 xl:px-0 xl:pr-6">
      <div className="flex flex-col items-center gap-2 text-sm font-medium leading-[1.3] text-foreground md:items-start">
        {stats?.map((stat) => (
          <p key={stat}>{stat}</p>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 md:justify-start xl:justify-center">
        <Moment moment={start} className="items-center md:items-start" />
        <ArrowRight className="size-4 shrink-0 text-foreground" />
        <Moment moment={end} className="items-center md:items-start" />
      </div>

      <div className="flex flex-col items-center justify-center gap-1.5 md:items-start xl:flex-1">
        <div className="flex flex-wrap items-center justify-center gap-1 md:justify-start">
          <span className="text-sm font-medium leading-[1.3] text-natural-500">{priceLabel}</span>
          <span className="text-[42px] font-bold leading-[1.15] text-black">{price}</span>
        </div>
        <p className="text-sm font-medium leading-[1.3] text-natural-500">{perPerson}</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 md:items-start">
        <button
          type="button"
          className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold leading-[1.3] text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Info className="size-4 shrink-0" />
          {prepayment}
        </button>
        <Button variant="neutral" size="md" className="w-full capitalize">
          View Details
        </Button>
      </div>
    </div>
  );
}

export default function BoatCard({ className, ...boat }: BoatCardProps) {
  return (
    <article
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border border-natural-50 bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)] xl:flex-row xl:items-stretch xl:gap-6",
        className,
      )}
    >
      <Gallery images={boat.images} imageAlt={boat.imageAlt} badges={boat.badges} />
      <Details
        location={boat.location}
        name={boat.name}
        rating={boat.rating}
        charterType={boat.charterType}
        crew={boat.crew}
        specs={boat.specs}
        amenities={boat.amenities}
      />
      <Action
        stats={boat.stats}
        start={boat.start}
        end={boat.end}
        priceLabel={boat.priceLabel}
        price={boat.price}
        perPerson={boat.perPerson}
        prepayment={boat.prepayment}
      />
    </article>
  );
}
