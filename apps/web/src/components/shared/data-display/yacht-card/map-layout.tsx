import { cn } from "@yacht-charter/ui/lib/utils";

import { MarinaPopover } from "@/components/shared/overlay/marina-popover";

import CardNote from "../card-note";
import {
  detailHrefOrPlaceholder,
  YachtCardAmount,
  YachtCardBadgeRow,
  YachtCardDetailsButton,
  YachtCardMedia,
  YachtCardName,
  YachtCardRating,
  YachtCardTags,
} from "./parts";
import type { YachtCardData } from "./types";

const LAYOUT = {
  compact: {
    card: "w-full flex-col",
    image: "h-45 w-full rounded-t-2xl",
    body: "px-4 pb-4",
    // 22px has no typography token: it falls between h6 (20) and h5 (24).
    // oxlint-disable-next-line design-tokens/no-arbitrary-size
    name: "text-[22px] font-semibold",
    // oxlint-disable-next-line design-tokens/no-arbitrary-size
    price: "text-[22px] font-semibold leading-[1.3]",
    priceRow: "items-center",
    perNight: "shrink-0",
    sizes: "288px",
  },
  popup: {
    card: "w-72 max-w-[calc(100vw-2rem)] flex-col md:w-150.25 md:flex-row",
    image: "h-45 w-full rounded-t-2xl md:h-auto md:w-74 md:rounded-tr-none md:rounded-bl-2xl",
    body: "px-4 pb-4 md:min-w-0 md:flex-1 md:py-6 md:pr-4 md:pl-0",
    name: "text-xl font-bold md:text-2xl md:font-semibold",
    price: "text-h4 font-bold",
    priceRow: "items-center md:flex-col md:items-stretch",
    perNight: "shrink-0 md:shrink",
    sizes: "(min-width: 768px) 296px, 288px",
  },
} as const;

export interface MapLayoutProps extends YachtCardData {
  layout: keyof typeof LAYOUT;
  /** Opens the yacht page in a new tab, so the map keeps its viewport and open popup. */
  openInNewTab?: boolean;
  className?: string;
}

/**
 * The map's cards: `compact` in the side list, `popup` over a pin. No specs, dates or availability
 * styling, so the status badge keeps the brand colour it has always had here.
 */
export default function MapLayout({
  layout,
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
  listPrice,
  perNight,
  note,
  detailHref,
  openInNewTab,
  className,
}: MapLayoutProps) {
  const style = LAYOUT[layout];

  return (
    <article
      className={cn(
        "flex gap-4 rounded-2xl border border-natural-50 bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.03)]",
        style.card,
        className,
      )}
    >
      <YachtCardMedia
        className={cn("relative shrink-0 overflow-hidden", style.image)}
        images={images}
        imageAlt={imageAlt}
        sizes={style.sizes}
      >
        <YachtCardBadgeRow id={id} badges={badges} toned={false} />
      </YachtCardMedia>

      <div className={cn("flex flex-col gap-4", style.body)}>
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={marina} />

          <div className="flex items-center gap-2">
            <YachtCardName
              name={name}
              detailHref={detailHrefOrPlaceholder(detailHref)}
              openInNewTab={openInNewTab}
              className={cn("min-w-0 truncate leading-[1.3] text-foreground", style.name)}
            />
            {rating ? (
              <YachtCardRating
                rating={rating}
                className="shrink-0 bg-transparent p-1.5 text-gold"
              />
            ) : null}
          </div>

          <YachtCardTags
            charterType={charterType}
            crew={crew}
            className="flex flex-wrap items-center gap-1.5"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className={cn("flex w-full gap-1.5", style.priceRow)}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium leading-[1.3] text-natural-500">
                {priceLabel}
              </span>
              <YachtCardAmount
                price={price}
                listPrice={listPrice}
                className="flex flex-wrap items-baseline gap-x-1.5"
                priceClassName={cn("text-black", style.price)}
              />
            </div>
            <p className={cn("text-sm font-medium leading-[1.3] text-natural-500", style.perNight)}>
              {perNight}
            </p>
          </div>

          {note ? <CardNote backdrop note={note} className="flex w-full" /> : null}
        </div>

        <YachtCardDetailsButton
          detailHref={detailHref}
          openInNewTab={openInNewTab}
          className="w-full capitalize"
        />
      </div>
    </article>
  );
}
