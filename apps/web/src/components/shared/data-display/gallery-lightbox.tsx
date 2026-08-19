"use client";

import { useTranslations } from "next-intl";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

/*
 * Kept in its own module so the lightbox — its two plugins and two stylesheets — is a separate
 * chunk, fetched when a visitor first opens a photo rather than on every page that shows one.
 * Most visitors never open it. Every caller imports it with `next/dynamic`; keeping the CSS
 * imports here is what moves them into that chunk too.
 *
 * Shared rather than owned by the listing page: the search cards open the same viewer, and a
 * component two features reach for belongs here (see apps/web/AGENTS.md).
 */
export default function GalleryLightbox({
  openAt,
  onClose,
  slides,
}: {
  openAt: number | null;
  onClose: () => void;
  slides: { src: string; alt?: string }[];
}) {
  const t = useTranslations("Common.gallery");

  return (
    <Lightbox
      open={openAt !== null}
      index={openAt ?? 0}
      close={onClose}
      slides={slides}
      plugins={[Zoom, Thumbnails]}
      thumbnails={{ imageFit: "cover" }}
      labels={{
        Close: t("close"),
        Previous: t("previous"),
        Next: t("next"),
        "Zoom in": t("zoomIn"),
        "Zoom out": t("zoomOut"),
      }}
    />
  );
}
