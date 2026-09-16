import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Check, Sailboat, Star, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { WishlistButton } from "@/features/wishlist";
import { type AppPathname, Link } from "@/i18n/navigation";
import { dayToDisplay } from "@/lib/date";

import { AmenityChip, AmenityOverflow } from "../amenity-chips";
import CardPhotos from "../card-photos";
import type {
  YachtCardAmenity,
  YachtCardBadge,
  YachtCardCharterDate,
  YachtCardSpec,
  YachtCardStat,
} from "./types";

/*
 * The pieces every layout of `YachtCard` is assembled from. Each takes its classes whole from the
 * layout rather than merging a default of its own, so a layout reads as the markup it renders.
 */

/* TODO: every card opens the same hardcoded detail page until listings carry a real id. */
const DETAIL_HREF = "/yachts/lagoon-42";

/** Bookings are proof someone committed, views only that someone looked. */
export const STAT_TONE = {
  booked: "text-positive-600",
  viewed: "text-gold",
} as const satisfies Record<YachtCardStat["kind"], string>;

const TITLE_LINK =
  "rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40";

interface YachtCardMediaProps {
  className: string;
  images: string[];
  imageAlt?: string;
  sizes: string;
  priority?: boolean;
  /** Laid over the photos: the badge row, or a save control. */
  children?: ReactNode;
}

export function YachtCardMedia({
  className,
  images,
  imageAlt,
  sizes,
  priority,
  children,
}: YachtCardMediaProps) {
  return (
    <div className={className}>
      <CardPhotos images={images} imageAlt={imageAlt} priority={priority} sizes={sizes} />
      {children}
    </div>
  );
}

interface YachtCardBadgeRowProps {
  id?: string;
  badges?: YachtCardBadge[];
  /** Whether a badge's `tone` colours it. The map layouts have always drawn every badge brand blue. */
  toned: boolean;
}

export function YachtCardBadgeRow({ id, badges, toned }: YachtCardBadgeRowProps) {
  return (
    /*
     * Laid over the photo, which is a button: without this the badge row, full width and two chips
     * tall on a well-tagged listing, would eat the hover and the click across the top of every
     * card. The chips are labels, so they stay transparent to the pointer and the photo under them
     * opens the gallery; only the wishlist control takes events back.
     */
    <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start gap-5">
      <div className="flex flex-1 flex-wrap items-start gap-1.5">
        {badges?.map((badge) => (
          <Chip
            key={badge.label}
            variant={(toned ? badge.tone : undefined) ?? (badge.solid ? undefined : "brand")}
            className={cn("shadow-brand-glow", badge.solid && "bg-brand text-brand-foreground")}
          >
            {badge.icon}
            {badge.label}
          </Chip>
        ))}
      </div>
      <WishlistButton listingId={id} className="pointer-events-auto" />
    </div>
  );
}

interface YachtCardNameProps {
  name: string;
  /** Without one the name is plain text, as on the booking recap. */
  detailHref?: AppPathname;
  openInNewTab?: boolean;
  className: string;
}

export function YachtCardName({ name, detailHref, openInNewTab, className }: YachtCardNameProps) {
  return (
    <h3 className={className}>
      {detailHref ? (
        <Link href={detailHref} target={openInNewTab ? "_blank" : undefined} className={TITLE_LINK}>
          {name}
        </Link>
      ) : (
        name
      )}
    </h3>
  );
}

/** Where a card has no detail link of its own and still has to open something. */
export function detailHrefOrPlaceholder(detailHref: AppPathname | undefined): AppPathname {
  return detailHref ?? DETAIL_HREF;
}

interface YachtCardRatingProps {
  rating?: string;
  className: string;
}

export function YachtCardRating({ rating, className }: YachtCardRatingProps) {
  return (
    <Chip className={className}>
      <Star className="fill-current" />
      {rating}
    </Chip>
  );
}

interface YachtCardTagsProps {
  charterType: string;
  crew: string;
  className: string;
}

export function YachtCardTags({ charterType, crew, className }: YachtCardTagsProps) {
  return (
    <div className={className}>
      <Chip variant="neutral">
        <Sailboat />
        {charterType}
      </Chip>
      <Chip variant="neutral">
        <Users />
        {crew}
      </Chip>
    </div>
  );
}

export function YachtCardSpecs({ specs }: { specs: YachtCardSpec[] }) {
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {specs.map((spec) =>
        spec.icon ? (
          <span
            key={spec.label}
            title={`${spec.label}: ${spec.value}`}
            className="inline-flex items-center gap-1 rounded-sm p-1 text-sm font-medium leading-[1.3] text-natural-500 [&_svg]:size-4 [&_svg]:shrink-0"
          >
            <span className="sr-only">{spec.label}: </span>
            <span aria-hidden>{spec.icon}</span>
            <span className="text-foreground">{spec.value}</span>
          </span>
        ) : (
          <span
            key={spec.label}
            className="inline-flex items-center gap-1 rounded-sm p-1 text-sm font-medium leading-[1.3] text-natural-500"
          >
            <Check className="size-4 shrink-0" />
            {spec.label}: <span className="text-foreground">{spec.value}</span>
          </span>
        ),
      )}
    </div>
  );
}

interface YachtCardAmenitiesProps {
  amenities?: YachtCardAmenity[];
  overflow?: YachtCardAmenity[];
}

export function YachtCardAmenities({ amenities, overflow }: YachtCardAmenitiesProps) {
  if (!amenities?.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {amenities.map((amenity) => (
        <AmenityChip key={amenity.label} amenity={amenity} />
      ))}
      {overflow?.length ? <AmenityOverflow amenities={overflow} /> : null}
    </div>
  );
}

interface YachtCardDateProps {
  value: YachtCardCharterDate;
  className?: string;
}

export function YachtCardDate({ value, className }: YachtCardDateProps) {
  const format = useFormatter();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold leading-[1.3] text-foreground">
        {format.dateTime(dayToDisplay(value.day), "dayShort")}
      </span>
      {value.time ? (
        <span className="text-sm font-medium leading-[1.3] text-natural-500">{value.time}</span>
      ) : null}
    </div>
  );
}

interface YachtCardAmountProps {
  price: string;
  listPrice?: string;
  className: string;
  priceClassName: string;
}

/**
 * The price and, struck through beside it, the list price it replaced. One baseline-aligned line,
 * so the struck figure reads as the price this one replaced rather than as a second price.
 */
export function YachtCardAmount({
  price,
  listPrice,
  className,
  priceClassName,
}: YachtCardAmountProps) {
  return (
    <span className={className}>
      <span className={priceClassName}>{price}</span>
      {listPrice ? (
        <span className="text-base font-medium leading-6 text-natural-500 line-through">
          {listPrice}
        </span>
      ) : null}
    </span>
  );
}

interface YachtCardDetailsButtonProps {
  detailHref?: AppPathname;
  openInNewTab?: boolean;
  className: string;
}

export function YachtCardDetailsButton({
  detailHref,
  openInNewTab,
  className,
}: YachtCardDetailsButtonProps) {
  const t = useTranslations("Common.boatCard");

  return (
    <Button
      variant="neutral"
      size="md"
      nativeButton={false}
      render={
        <Link
          href={detailHrefOrPlaceholder(detailHref)}
          target={openInNewTab ? "_blank" : undefined}
        />
      }
      className={className}
    >
      {t("viewDetails")}
    </Button>
  );
}
