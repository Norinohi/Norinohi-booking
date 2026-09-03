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
import { MAP_MARINA_ZOOM } from "@/lib/mapbox";
import { serializeMapCamera } from "../../lib/search-params";
import { toMarina } from "../../lib/to-marina";

const ACTION = "w-full md:w-auto";

/**
 * Where "See on map" points: the boat, and the camera already on it.
 *
 * Carrying the camera is what makes the map *open* at the marina rather than open on the Adriatic
 * and then fly there. The flight was several seconds of an arc the visitor never asked for — they
 * had already said where they wanted to be — and it loaded the wrong tiles on the way.
 *
 * Encoded through the map's own serializer, so the two never disagree about the format.
 */
function seeOnMapHref(listingId: string, base: { lat: number; lng: number }) {
  return serializeMapCamera(`/yachts/map?selected=${listingId}`, {
    zoom: MAP_MARINA_ZOOM,
    centre: { lat: base.lat, lng: base.lng },
  });
}

export default function TitleBlock() {
  const tDetail = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const tBadge = useTranslations("Common.boatCard.badges");
  const { data } = useListingDetail();

  if (!data) return null;

  /*
   * The model, but only when it says something the name does not - the same rule the sync uses
   * to decide whether to append it to `title`, applied to the halves instead of the string.
   * Without it, a boat the vendor named after its model reads "Sole | Sole".
   */
  const modelSubtitle =
    data.name && data.model && !data.name.toLowerCase().includes(data.model.toLowerCase())
      ? data.model
      : undefined;

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
        {/*
          Name and model as two elements rather than one merged string. `title` stays the joined
          form for the tab, the breadcrumb and structured data; here the boat's own name carries
          the weight and the model sits beside it, separated but plainly secondary.

          `name` is null on a listing synced before the column existed, and the model is absent
          whenever it would only repeat the name (a vendor that files a one-off yacht under its
          own name as the model) - both fall back to the merged title, which is what this
          rendered before.
        */}
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[42px] leading-[1.15] font-bold text-foreground">
          {data.name ?? data.title}
          {modelSubtitle ? (
            <span aria-hidden className="text-natural-200 max-md:hidden">
              |
            </span>
          ) : null}
          {modelSubtitle ? (
            <span className="text-[28px] leading-[1.2] font-medium text-natural-500">
              {modelSubtitle}
            </span>
          ) : null}
        </h1>
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
          render={<Link href={seeOnMapHref(data.id, data.base)} />}
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
