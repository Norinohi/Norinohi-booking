"use client";

import { useTranslations } from "next-intl";
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

/*
 * Split out of Gallery so the lightbox — its two plugins and two stylesheets — is a separate
 * chunk, fetched when a visitor first opens a photo rather than on every listing page load. Most
 * visitors never open it. The dynamic import lives in gallery.tsx; keeping the CSS imports here
 * is what moves them into that chunk too.
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
  const t = useTranslations("YachtDetail");

  return (
    <Lightbox
      open={openAt !== null}
      index={openAt ?? 0}
      close={onClose}
      slides={slides}
      plugins={[Zoom, Thumbnails]}
      thumbnails={{ imageFit: "cover" }}
      labels={{
        Close: t("gallery.close"),
        Previous: t("gallery.previous"),
        Next: t("gallery.next"),
        "Zoom in": t("gallery.zoomIn"),
        "Zoom out": t("gallery.zoomOut"),
      }}
    />
  );
}
