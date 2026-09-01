"use client";

import { Play, Rotate3d } from "lucide-react";
import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/**
 * The operator's own footage of this boat.
 *
 * Two links rather than a player: the vendor gives a YouTube or Vimeo id and whatever the
 * operator pasted for a 360 tour, and embedding a third-party frame on the detail page would
 * put someone else's script beside a checkout. Rendered only where the operator published one,
 * which today is a small minority of the fleet.
 */
export default function MediaLinksSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  const videoUrl = data?.media.videoUrl;
  const tourUrl = data?.media.tourUrl;
  if (!videoUrl && !tourUrl) return null;

  return (
    <DetailSection id="media" title={t("sections.media")}>
      <div className="flex flex-wrap gap-3">
        {videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-natural-50"
          >
            <Play className="size-5" />
            {t("media.video")}
          </a>
        ) : null}
        {tourUrl ? (
          <a
            href={tourUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-natural-50"
          >
            <Rotate3d className="size-5" />
            {t("media.tour")}
          </a>
        ) : null}
      </div>
    </DetailSection>
  );
}
