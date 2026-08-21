"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Map, Sailboat, Share, Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { MarinaPopover } from "@/components/shared/overlay/marina-popover";
import { WishlistButton } from "@/features/wishlist";
import { Link } from "@/i18n/navigation";

import { useListingDetail } from "../../hooks/use-listing-detail";
import { badgeLabel } from "@/lib/badge-label";
import { crewLabel } from "@/lib/crew-label";
import { toMarina } from "../../lib/to-marina";

const ACTION = "w-full md:w-auto";

export default function TitleBlock() {
  const tDetail = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const tBadge = useTranslations("Common.boatCard.badges");
  const { data } = useListingDetail();

  if (!data) return null;

  const shareListing = () => {
    const url = window.location.href;
    if (navigator.share) {
      // Native share sheet on mobile/supported browsers; ignore the reject when the user cancels.
      void navigator.share({ title: data.title, url }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(url).then(() => toast.success(tDetail("linkCopied")));
    }
  };

  /* Grid from `md` up, so the actions sit on the badge line while staying last in the DOM —
     three full-width buttons above the yacht's name is what a phone wants. */
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-5 md:gap-y-4">
      <div className="flex flex-wrap items-start gap-1.5 md:col-start-1 md:row-start-1">
        {/* Same rule as the search card: an unbookable yacht has nothing to promote. */}
        {data.availability.hasAvailableDates ? (
          data.badges.map((badge) => <Chip key={badge.code}>{badgeLabel(tBadge, badge)}</Chip>)
        ) : (
          <Chip variant="neutral">{tCard("badges.unavailable")}</Chip>
        )}
      </div>

      <MarinaPopover
        marina={toMarina(data.base)}
        className="md:col-span-2 md:col-start-1 md:row-start-2"
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-4 md:col-span-2 md:col-start-1 md:row-start-3">
        <h1 className="text-[42px] font-bold leading-[1.15] text-foreground">{data.title}</h1>
        {/* Unrated is not zero — the read model coalesces an absent score, this puts it back. */}
        {data.rating > 0 ? (
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            {data.rating}
          </Chip>
        ) : null}
        <div className="flex basis-full items-center gap-1.5 md:basis-auto">
          <Chip variant="neutral">
            <Sailboat />
            {data.category}
          </Chip>
          {data.crewType ? (
            <Chip variant="neutral">
              <Users />
              {crewLabel(tCrew, data.crewType)}
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:col-start-2 md:row-start-1 md:flex-row md:gap-3">
        <Button
          variant="subtle"
          onClick={shareListing}
          className={`${ACTION} max-md:border-border max-md:bg-secondary`}
        >
          <Share />
          {tDetail("share")}
        </Button>
        <Button
          variant="neutral"
          nativeButton={false}
          render={<Link href={`/yachts/map?selected=${data.id}`} />}
          className={ACTION}
        >
          <Map />
          {tDetail("seeOnMap")}
        </Button>
        <WishlistButton
          listingId={data.id}
          variant="detail"
          className={`${ACTION} max-md:order-first`}
        />
      </div>
    </div>
  );
}
