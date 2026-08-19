"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Sailboat, Star, Users } from "lucide-react";
import type { AppPathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import type { BoatCardBadge } from "@/components/shared/data-display/boat-card";
import CardPhotos from "@/components/shared/data-display/card-photos";
import CardNote from "@/components/shared/data-display/card-note";
import type { CardNote as CardNoteData } from "@/components/shared/data-display/card-note";
import { type Marina, MarinaPopover } from "@/components/shared/overlay/marina-popover";
import { WishlistButton } from "@/features/wishlist";

/* TODO: every card opens the same hardcoded detail page until listings carry a real id. */
const DETAIL_HREF = "/yachts/lagoon-42";

const LAYOUT = {
  list: {
    card: "w-full flex-col",
    image: "h-45 w-full rounded-t-2xl",
    body: "px-4 pb-4",
    name: "text-[22px] font-semibold",
    price: "text-[22px] font-semibold leading-[1.3]",
    priceRow: "items-center",
    perPerson: "shrink-0",
    sizes: "288px",
  },
  popup: {
    card: "w-72 max-w-[calc(100vw-2rem)] flex-col md:w-150.25 md:flex-row",
    image: "h-45 w-full rounded-t-2xl md:h-auto md:w-74 md:rounded-tr-none md:rounded-bl-2xl",
    body: "px-4 pb-4 md:min-w-0 md:flex-1 md:py-6 md:pr-4 md:pl-0",
    name: "text-xl font-bold md:text-2xl md:font-semibold",
    price: "text-[32px] font-bold leading-[1.1]",
    priceRow: "items-center md:flex-col md:items-stretch",
    perPerson: "shrink-0 md:shrink",
    sizes: "(min-width: 768px) 296px, 288px",
  },
} as const;
export type MapBoatCardProps = {
  /** Listing id — absent on cards rendering sample data, which leaves the bookmark inert. */
  id?: string;
  images: string[];
  imageAlt?: string;
  badges?: BoatCardBadge[];
  marina: Marina;
  name: string;
  rating?: string;
  charterType: string;
  crew: string;
  priceLabel: string;
  price: string;
  perPerson: string;
  note: CardNoteData | null;
  detailHref?: AppPathname;
  layout?: keyof typeof LAYOUT;
  className?: string;
};

export default function MapBoatCard({
  id,
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
  note,
  detailHref,
  layout = "list",
  className,
}: MapBoatCardProps) {
  const t = useTranslations("Common.boatCard");
  const style = LAYOUT[layout];

  return (
    <article
      className={cn(
        "flex gap-4 rounded-2xl border border-natural-50 bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)]",
        style.card,
        className,
      )}
    >
      <div className={cn("relative shrink-0 overflow-hidden", style.image)}>
        <CardPhotos images={images} imageAlt={imageAlt} sizes={style.sizes} />

        {/* Transparent to the pointer, like the search card's: the photo below opens the gallery. */}
        <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start gap-5">
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
          <WishlistButton listingId={id} className="pointer-events-auto" />
        </div>
      </div>

      <div className={cn("flex flex-col gap-4", style.body)}>
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={marina} />

          <div className="flex items-center gap-2">
            <h3 className={cn("min-w-0 truncate leading-[1.3] text-foreground", style.name)}>
              {name}
            </h3>
            {rating ? (
              <Chip className="shrink-0 bg-transparent p-1.5 text-gold">
                <Star className="fill-current" />
                {rating}
              </Chip>
            ) : null}
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
          <div className={cn("flex w-full gap-1.5", style.priceRow)}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium leading-[1.3] text-natural-500">
                {priceLabel}
              </span>
              <span className={cn("text-black", style.price)}>{price}</span>
            </div>
            <p
              className={cn("text-sm font-medium leading-[1.3] text-natural-500", style.perPerson)}
            >
              {perPerson}
            </p>
          </div>

          {note ? <CardNote backdrop note={note} className="flex w-fit" /> : null}
        </div>

        <Button
          variant="neutral"
          size="md"
          nativeButton={false}
          render={<Link href={detailHref ?? DETAIL_HREF} />}
          className="w-full capitalize"
        >
          {t("viewDetails")}
        </Button>
      </div>
    </article>
  );
}
