import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, Bookmark } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { MarinaPopover } from "@/components/shared/overlay/marina-popover";

import {
  YachtCardDate,
  YachtCardMedia,
  YachtCardName,
  YachtCardRating,
  YachtCardTags,
} from "./parts";
import type { YachtCardData } from "./types";

export interface HistoryLayoutProps extends YachtCardData {
  priority?: boolean;
  /** After the rating, on the name's line: a booking's status. */
  titleAside?: ReactNode;
  /** The action column's buttons, stretched to one width. */
  actions: ReactNode;
  className?: string;
}

/**
 * The simplified horizontal entry My Bookings shows from xl: photo, one info column, actions.
 * Hidden below xl, where the booking renders as a `row` card instead.
 */
export default function HistoryLayout({
  images,
  imageAlt,
  priority,
  marina,
  name,
  rating,
  charterType,
  crew,
  start,
  end,
  price,
  detailHref,
  titleAside,
  actions,
  className,
}: HistoryLayoutProps) {
  const t = useTranslations("Common.boatCard");

  return (
    /*
     * The action track is a fixed 15rem rather than `auto`. Sized to content it came out
     * different on every row: a card offering only "View Details" was ~80px narrower than one
     * that also cancels, and wider again where a "Complete payment EUR 1,224" button appears,
     * so a column of cards had a ragged right edge and no two buttons lined up. 15rem is what
     * the longest of those labels needs; the photo is the track that gives, and it widens
     * again at 2xl where the panel is wide enough to afford it.
     */
    <article
      className={cn(
        "hidden w-full overflow-hidden rounded-2xl border border-natural-100 bg-card xl:grid xl:grid-cols-[minmax(0,--spacing(65))_minmax(0,1fr)_15rem] xl:items-stretch xl:gap-6 2xl:grid-cols-[minmax(0,--spacing(95))_minmax(0,1fr)_15rem]",
        className,
      )}
    >
      <YachtCardMedia
        className="relative overflow-hidden rounded-l-2xl"
        images={images}
        imageAlt={imageAlt}
        priority={priority}
        sizes="(min-width: 1536px) 380px, (min-width: 1280px) 260px, 100vw"
      >
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
      </YachtCardMedia>

      <div className="flex min-w-0 flex-col gap-4 border-r border-natural-50 py-6 pr-6">
        <div className="flex flex-col gap-3">
          <MarinaPopover marina={marina} />

          <div className="flex flex-wrap items-center gap-2">
            <YachtCardName
              name={name}
              detailHref={detailHref}
              className="text-h4 min-w-0 truncate text-foreground"
            />
            <YachtCardRating rating={rating} className="shrink-0 bg-transparent p-1.5 text-gold" />
            {titleAside}
          </div>

          <YachtCardTags
            charterType={charterType}
            crew={crew}
            className="flex flex-wrap items-center gap-1.5"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {start ? <YachtCardDate value={start} /> : null}
          <ArrowRight className="size-4 shrink-0 text-foreground" />
          {end ? <YachtCardDate value={end} /> : null}
        </div>

        <p className="text-h3 text-black">{price}</p>
      </div>

      {/* items-stretch, not items-center: the widest label sets the track, and the other buttons
          match it instead of each sizing to its own text. */}
      <div className="flex flex-col items-stretch justify-center gap-3 py-6 pr-6">{actions}</div>
    </article>
  );
}
