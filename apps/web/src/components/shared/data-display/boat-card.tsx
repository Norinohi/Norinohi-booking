import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, Check, Sailboat, Star, Users } from "lucide-react";
import type { AppPathname } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

import { dayToDisplay } from "@/lib/date";

import { type Marina, MarinaPopover } from "@/components/shared/overlay/marina-popover";
import { WishlistButton } from "@/features/wishlist";

import CardNote from "./card-note";
import type { CardNote as CardNoteData } from "./card-note";
import CardPhotos from "./card-photos";

const FORMATS = {
  day: { day: "numeric", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
} as const;

export type BoatCardBadge = {
  label: string;
  icon?: ReactNode;
  solid?: boolean;
  /** Neutral grey instead of brand blue — used by the unavailable tag. */
  muted?: boolean;
};
export type BoatCardSpec = {
  label: string;
  value: string;
  /**
   * Drawn in place of the check mark and the spelled-out label ("Toilets: 2" becomes a toilet
   * glyph and "2"). The label survives as the tooltip and the accessible name.
   */
  icon?: ReactNode;
};
export type BoatCardAmenity = { icon: ReactNode; label: string };
/**
 * A charter endpoint: the calendar day, and the marina's wall-clock time for it.
 *
 * `time` is text the provider states about its own base, never an instant. Combining the two
 * into a timestamp would need an IANA zone per marina, which no provider sends, and the card
 * carried a hardcoded Zagreb one for exactly that reason. Kept apart and rendered as given.
 */
export type BoatCardCharterDate = { day: string; time: string | null };

/* TODO: every card opens the same hardcoded detail page until listings carry a real id. */
const DETAIL_HREF = "/yachts/lagoon-42";

export type BoatCardProps = {
  /** Listing id — absent on cards rendering sample data, which leaves the bookmark inert. */
  id?: string;
  images: string[];
  imageAlt?: string;
  badges?: BoatCardBadge[];
  marina: Marina;
  name: string;
  /** Absent for a listing nobody has rated — the chip is dropped rather than showing a zero. */
  rating?: string;
  charterType: string;
  crew: string;
  specs: BoatCardSpec[];
  amenities?: BoatCardAmenity[];
  stats?: string[];
  /**
   * The charter the dates describe: the one that was searched for, or, on an undated search,
   * the first one this boat would sell. Absent where no period is in play at all — the wishlist
   * is not a search result, and a boat with nothing to sell has no period to name.
   */
  start?: BoatCardCharterDate;
  end?: BoatCardCharterDate;
  priceLabel: string;
  price: string;
  /** The price slot holds words ("On request", "Unavailable") rather than an amount, so it drops to text size. */
  priceIsLabel?: boolean;
  /** The listing has no bookable dates — the photo desaturates and the copy dims. */
  unavailable?: boolean;
  perPerson: string;
  /** Money footnote under the price, with the tooltip that explains that figure. */
  note: CardNoteData | null;
  detailHref?: AppPathname;
  priority?: boolean;
  /** Drops the dates/price/action column — the booking flow only recaps the boat. */
  summary?: boolean;
  /** Sits at the foot of the details column in `summary` mode, where the action column would be. */
  summaryAction?: ReactNode;
  /** Extra content rendered inside the card, under the action button (e.g. My Bookings' Cancel). */
  footer?: ReactNode;
  className?: string;
};

function Gallery({
  id,
  images,
  imageAlt,
  badges,
  priority,
  unavailable,
}: Pick<BoatCardProps, "id" | "images" | "imageAlt" | "badges" | "priority" | "unavailable">) {
  return (
    <div
      className={cn(
        "relative h-64 w-full min-w-0 overflow-hidden rounded-t-2xl xl:h-auto xl:rounded-tr-none xl:rounded-bl-2xl",
        unavailable && "[&_img]:opacity-60 [&_img]:grayscale",
      )}
    >
      <CardPhotos
        images={images}
        imageAlt={imageAlt}
        priority={priority}
        sizes="(min-width: 1280px) 40vw, 100vw"
      />

      {/*
       * Laid over the photo, which is now a button: without this the badge row — full width, and
       * two chips tall on a well-tagged listing — would eat the hover and the click across the top
       * of every card. The chips are labels, so they stay transparent to the pointer and the photo
       * under them opens the gallery; only the wishlist control takes events back.
       */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start gap-5">
        <div className="flex flex-1 flex-wrap items-start gap-1.5">
          {badges?.map((badge) => (
            <Chip
              key={badge.label}
              variant={badge.muted ? "neutral" : badge.solid ? undefined : "brand"}
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
  );
}

function Details({
  marina,
  name,
  rating,
  charterType,
  crew,
  specs,
  amenities,
  detailHref,
  summary,
  summaryAction,
  unavailable,
}: Pick<
  BoatCardProps,
  | "marina"
  | "name"
  | "rating"
  | "charterType"
  | "crew"
  | "specs"
  | "amenities"
  | "detailHref"
  | "summary"
  | "summaryAction"
  | "unavailable"
>) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 p-4 md:p-6 xl:pl-0",
        summary || "xl:border-r xl:border-natural-50",
        unavailable && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-3">
        <MarinaPopover marina={marina} />

        <div className="flex flex-wrap items-start gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {/* The name opens the same page as "View Details"; a card without one (the booking
                recap) keeps plain text. */}
            <h3 className="min-w-0 line-clamp-2 pb-1 text-[28px] font-medium leading-[1.1] break-words text-foreground md:text-[32px]">
              {detailHref ? (
                <Link
                  href={detailHref}
                  className="rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {name}
                </Link>
              ) : (
                name
              )}
            </h3>
            {rating ? (
              <Chip className="mt-0.5 shrink-0 bg-transparent p-1.5 text-gold">
                <Star className="fill-current" />
                {rating}
              </Chip>
            ) : null}
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 md:w-auto xl:hidden">
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

        <div className="hidden flex-wrap items-center gap-1.5 xl:flex">
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

      {amenities?.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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

      {summaryAction ? (
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">{summaryAction}</div>
      ) : null}
    </div>
  );
}

function CharterDate({ value, className }: { value: BoatCardCharterDate; className?: string }) {
  const format = useFormatter();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold leading-[1.3] text-foreground">
        {format.dateTime(dayToDisplay(value.day), FORMATS.day)}
      </span>
      {value.time ? (
        <span className="text-sm font-medium leading-[1.3] text-natural-500">{value.time}</span>
      ) : null}
    </div>
  );
}

function Action({
  stats,
  start,
  end,
  priceLabel,
  price,
  priceIsLabel,
  perPerson,
  note,
  detailHref,
  footer,
}: Pick<
  BoatCardProps,
  | "stats"
  | "start"
  | "end"
  | "priceLabel"
  | "price"
  | "priceIsLabel"
  | "perPerson"
  | "note"
  | "detailHref"
  | "footer"
>) {
  const t = useTranslations("Common.boatCard");

  return (
    <div className="flex flex-col gap-3 border-t border-natural-50 p-4 md:grid md:grid-cols-2 md:items-end md:gap-x-4 md:gap-y-3 md:p-6 xl:flex xl:min-w-0 xl:flex-col xl:items-stretch xl:border-t-0 xl:pl-0">
      <div className="flex flex-col items-center gap-2 text-sm font-medium leading-[1.3] text-foreground md:items-start">
        {stats?.map((stat) => (
          <p key={stat}>{stat}</p>
        ))}
      </div>

      {start && end ? (
        <div className="flex w-full items-center justify-center gap-3 md:justify-start xl:justify-center">
          <CharterDate value={start} className="flex-1 items-center md:flex-none md:items-start" />
          <ArrowRight className="size-4 shrink-0 text-foreground" />
          <CharterDate value={end} className="flex-1 items-center md:flex-none md:items-start" />
        </div>
      ) : null}

      <div className="flex flex-col items-center justify-center gap-1 md:items-start xl:flex-1">
        <div className="flex flex-wrap items-center justify-center gap-2 md:flex-col md:items-start md:gap-1">
          <span className="order-2 text-sm font-medium leading-[1.3] text-natural-500 md:order-1">
            {priceLabel}
          </span>
          {/* `leading` sits after the font size on purpose: tailwind-merge lets a later font size drop an
              earlier line-height, which is how the price used to render at the default 1.5. */}
          <span
            className={cn(
              "order-1 font-bold text-black md:order-2",
              priceIsLabel ? "text-xl" : "text-2xl leading-[1.15] md:text-[28px]",
            )}
          >
            {price}
          </span>
        </div>
        <p className="text-sm font-medium leading-[1.3] text-natural-500">{perPerson}</p>
        {note ? <CardNote backdrop note={note} className="flex md:hidden" /> : null}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 md:items-start">
        {note ? <CardNote backdrop note={note} className="hidden md:flex" /> : null}
        <Button
          variant="neutral"
          size="md"
          nativeButton={false}
          render={<Link href={detailHref ?? DETAIL_HREF} />}
          className="w-full capitalize"
        >
          {t("viewDetails")}
        </Button>
        {footer}
      </div>
    </div>
  );
}

export default function BoatCard({ className, ...boat }: BoatCardProps) {
  return (
    <article
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)] xl:grid xl:items-stretch xl:gap-6",
        boat.summary
          ? "border-border xl:grid-cols-[minmax(0,452fr)_minmax(0,566fr)]"
          : "border-natural-50 xl:grid-cols-[minmax(0,452fr)_minmax(0,334fr)_minmax(208px,232fr)]",
        className,
      )}
    >
      <Gallery
        id={boat.id}
        images={boat.images}
        imageAlt={boat.imageAlt}
        badges={boat.badges}
        priority={boat.priority}
        unavailable={boat.unavailable}
      />
      <Details
        marina={boat.marina}
        name={boat.name}
        rating={boat.rating}
        charterType={boat.charterType}
        crew={boat.crew}
        specs={boat.specs}
        amenities={boat.amenities}
        detailHref={boat.detailHref}
        summary={boat.summary}
        summaryAction={boat.summary ? boat.summaryAction : undefined}
        unavailable={boat.unavailable}
      />
      {boat.summary ? null : (
        <Action
          stats={boat.stats}
          start={boat.start}
          end={boat.end}
          priceLabel={boat.priceLabel}
          price={boat.price}
          priceIsLabel={boat.priceIsLabel}
          perPerson={boat.perPerson}
          note={boat.note}
          detailHref={boat.detailHref}
          footer={boat.footer}
        />
      )}
    </article>
  );
}
