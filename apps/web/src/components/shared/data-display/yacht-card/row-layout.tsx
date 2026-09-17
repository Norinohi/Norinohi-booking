import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { MarinaPopover } from "@/components/shared/overlay/marina-popover";

import CardNote from "../card-note";
import HoldCountdown from "../hold-countdown";
import {
  STAT_TONE,
  YachtCardAmenities,
  YachtCardAmount,
  YachtCardBadgeRow,
  YachtCardDate,
  YachtCardDetailsButton,
  YachtCardMedia,
  YachtCardName,
  YachtCardRating,
  YachtCardSpecs,
  YachtCardTags,
} from "./parts";
import type { YachtCardData } from "./types";

export interface RowLayoutProps extends YachtCardData {
  /** Drops the dates, price and action column: the booking flow only recaps the boat. */
  summary: boolean;
  priority?: boolean;
  /**
   * Opens the yacht page in a new tab. The catalogue sets it so a visitor comparing boats keeps
   * their filters, scroll position and loaded pages instead of rebuilding them on the way back.
   */
  openInNewTab?: boolean;
  /** Sits at the foot of the details column in `summary` mode, where the action column would be. */
  summaryAction?: ReactNode;
  /** Extra content under the action button, such as My Bookings' Cancel. */
  footer?: ReactNode;
  className?: string;
}

/** The search result: photos, details and a price column side by side from xl, stacked below. */
export default function RowLayout({ className, ...boat }: RowLayoutProps) {
  return (
    <article
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-card xl:grid xl:items-stretch xl:gap-6",
        boat.summary
          ? "border-border xl:grid-cols-[minmax(0,452fr)_minmax(0,566fr)]"
          : "border-natural-50 xl:grid-cols-[minmax(0,452fr)_minmax(0,334fr)_minmax(--spacing(52),232fr)]",
        className,
      )}
    >
      <YachtCardMedia
        className={cn(
          "relative h-64 w-full min-w-0 overflow-hidden rounded-t-2xl xl:h-auto xl:rounded-tr-none xl:rounded-bl-2xl",
          boat.unavailable && "[&_img]:opacity-60 [&_img]:grayscale",
        )}
        images={boat.images}
        imageAlt={boat.imageAlt}
        priority={boat.priority}
        sizes="(min-width: 1280px) 40vw, 100vw"
      >
        <YachtCardBadgeRow id={boat.id} badges={boat.badges} toned />
      </YachtCardMedia>
      <Details {...boat} />
      {boat.summary ? null : <Action {...boat} />}
    </article>
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
  amenitiesOverflow,
  detailHref,
  openInNewTab,
  summary,
  summaryAction,
  unavailable,
}: Omit<RowLayoutProps, "className">) {
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
            <YachtCardName
              name={name}
              detailHref={detailHref}
              openInNewTab={openInNewTab}
              className="text-h4 min-w-0 line-clamp-2 pb-1 wrap-break-word text-foreground"
            />
            {rating ? (
              <YachtCardRating
                rating={rating}
                className="mt-0.5 shrink-0 bg-transparent p-1.5 text-gold"
              />
            ) : null}
          </div>
          <YachtCardTags
            charterType={charterType}
            crew={crew}
            className="flex w-full flex-wrap items-center gap-1.5 md:w-auto xl:hidden"
          />
        </div>

        <YachtCardTags
          charterType={charterType}
          crew={crew}
          className="hidden flex-wrap items-center gap-1.5 xl:flex"
        />
      </div>

      <YachtCardSpecs specs={specs} />

      <YachtCardAmenities amenities={amenities} overflow={amenitiesOverflow} />

      {summary && summaryAction ? (
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">{summaryAction}</div>
      ) : null}
    </div>
  );
}

function Action({
  stats,
  start,
  datesNote,
  hold,
  end,
  priceLabel,
  price,
  listPrice,
  priceExtras,
  priceLabelLeads,
  priceIsLabel,
  perPerson,
  perNight,
  note,
  detailHref,
  openInNewTab,
  footer,
}: Omit<RowLayoutProps, "className">) {
  return (
    <div className="flex flex-col gap-3 border-t border-natural-50 p-4 md:grid md:grid-cols-2 md:items-end md:gap-x-4 md:gap-y-3 md:p-6 xl:flex xl:min-w-0 xl:flex-col xl:items-stretch xl:border-t-0 xl:pl-0">
      <div className="flex flex-col items-center gap-2 text-sm font-medium leading-[1.3] md:items-start">
        {stats?.map((stat) => (
          <p key={stat.kind} className={STAT_TONE[stat.kind]}>
            {stat.label}
          </p>
        ))}
      </div>

      {start && end && datesNote ? (
        <p className="w-full text-center text-sm leading-[1.3] text-natural-500 md:text-left">
          {datesNote}
        </p>
      ) : null}

      {hold ? (
        <HoldCountdown expiresAt={hold.expiresAt} className="w-full text-center md:text-left" />
      ) : null}

      {/* `min-w-0` throughout, and no `flex-none`: a longer locale writes the same date as
          "10 жовт. 2026 р.", which overran the narrow price column when the dates could not
          shrink. */}
      {start && end ? (
        <div className="flex w-full min-w-0 items-center justify-center gap-3 md:justify-start">
          <YachtCardDate value={start} className="min-w-0 flex-1 items-center md:items-start" />
          <ArrowRight className="size-4 shrink-0 text-foreground" />
          <YachtCardDate value={end} className="min-w-0 flex-1 items-center md:items-start" />
        </div>
      ) : null}

      <div className="flex flex-col items-center justify-center gap-1 md:items-start xl:flex-1">
        <div className="flex flex-col items-center gap-1 md:items-start">
          <span
            className={cn(
              "text-center text-sm font-medium leading-[1.3] text-natural-500 md:order-1 md:text-left",
              priceLabelLeads ? "order-1" : "order-2",
            )}
          >
            {priceLabel}
          </span>
          {/* The struck figure is dropped on a card whose price slot holds words: there is
              nothing for a discount to be a discount from. */}
          <YachtCardAmount
            price={price}
            listPrice={priceIsLabel ? undefined : listPrice}
            className={cn(
              "flex flex-wrap items-baseline justify-center gap-x-1.5 md:order-2 md:justify-start",
              priceLabelLeads ? "order-2" : "order-1",
            )}
            /* `leading` sits after the font size on purpose: tailwind-merge lets a later font size
               drop an earlier line-height, which is how the price used to render at the default 1.5. */
            priceClassName={cn(
              "font-bold text-black",
              // The 24 -> 28 ramp has no token: text-h4 goes to 32 at md.
              // oxlint-disable-next-line design-tokens/no-arbitrary-size
              priceIsLabel ? "text-xl" : "text-2xl leading-[1.15] md:text-[28px]",
            )}
          />
        </div>
        {/* One derived figure, not two: a catalogue card shows the nightly rate the list is
            ordered by, a booking card the per-person share of a party that actually exists. */}
        <p className="text-center text-sm font-medium leading-[1.3] text-natural-500 md:text-left">
          {perNight ?? perPerson}
        </p>
        {priceExtras ? (
          <p className="text-center text-sm font-medium leading-[1.3] text-natural-500 md:text-left">
            {priceExtras}
          </p>
        ) : null}
        {note ? <CardNote backdrop note={note} className="mt-1 flex max-w-full md:hidden" /> : null}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 md:items-start">
        {note ? <CardNote backdrop note={note} className="hidden w-full md:flex" /> : null}
        <YachtCardDetailsButton
          detailHref={detailHref}
          openInNewTab={openInNewTab}
          className="w-full"
        />
        {footer}
      </div>
    </div>
  );
}
