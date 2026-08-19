"use client";

import { Dialog, DialogContent, DialogTitle } from "@yacht-charter/ui/components/overlay/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Maximize2, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Image } from "@/components/shared/data-display/image";
import { staticMapUrl } from "@/lib/mapbox";

import type { Coordinates } from "./marina-popover";

/*
 * mapbox-gl and its stylesheet are far larger than the picture they replace, and every card on a
 * results page carries one of these. Fetched when a visitor opens the map, never with the list.
 */
const MapDialogCanvas = dynamic(() => import("./map-dialog-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

/** Close enough to read the streets around a marina, which is what the picture cannot show. */
const DIALOG_ZOOM = 14;

export type MapPreviewProps = {
  point: Coordinates;
  /** Names the place in the dialog's heading and in the trigger's accessible name. */
  title: string;
  /** Zoom for the still picture. The dialog opens closer — see `DIALOG_ZOOM`. */
  zoom?: number;
  /** The `sizes` hint for the still, which differs per slot. */
  imageSizes: string;
  /** Sizes the still. The dialog is sized by the dialog. */
  className?: string;
  /** Dimensions for the Mapbox still, e.g. "500x236@2x". */
  imageSize?: string;
  /** A ready-made still, where one was stored with the record. */
  imageUrl?: string;
  pinClassName?: string;
  /** Reported so a hover-opened surface hosting this can stay open while the map is up. */
  onOpenChange?: (open: boolean) => void;
};

/**
 * A place as a still picture that opens the real map.
 *
 * Both stills in the app — the marina card's and the listing's pick-up address — drew the same
 * thing: a Mapbox raster, a dark wash, a pin in a translucent disc. Neither could be panned or
 * zoomed, so a visitor who wanted to know what is *around* a marina had nowhere to go. This is
 * that picture, now a button, with the live map behind it.
 *
 * The map mounts only while the dialog is open. That keeps mapbox-gl out of the page for everyone
 * who never opens it, and it sidesteps the reconnect react-map-gl cannot survive (see `MapCanvas`)
 * — a closed dialog leaves nothing to reconnect.
 */
export default function MapPreview({
  point,
  title,
  zoom = 13,
  imageSizes,
  className,
  imageSize,
  imageUrl,
  pinClassName,
  onOpenChange,
}: MapPreviewProps) {
  const t = useTranslations("Common.map");
  const [open, setOpen] = useState(false);

  function setDialogOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("open", { place: title })}
        onClick={() => setDialogOpen(true)}
        className={cn(
          "group relative block cursor-pointer overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
          className,
        )}
      >
        <Image
          src={imageUrl ?? staticMapUrl(point, imageSize ? { zoom, size: imageSize } : { zoom })}
          alt=""
          fill
          unoptimized
          sizes={imageSizes}
          className="object-cover"
        />

        {/* Lifts on hover, so the still reads as a way in rather than a decoration. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-black/40 transition-colors group-hover:bg-black/25"
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-1/2 flex size-21 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25 transition-transform group-hover:scale-110",
            pinClassName,
          )}
        >
          <MapPin className="size-6 fill-brand text-white" />
        </span>
        {/*
         * Always on show. Revealed on hover it was invisible on a phone, and even with a pointer
         * it only answered the question after the visitor had already guessed the answer — this
         * is the one mark that says the still is a way in rather than a picture.
         */}
        <span
          aria-hidden
          className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-lg bg-black/40 text-white transition-colors group-hover:bg-black/60"
        >
          <Maximize2 className="size-4" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setDialogOpen}>
        {/*
         * Sized against the viewport rather than the 432px the default dialog carries: a map is
         * only useful at some size. `min-h` keeps it usable on a short window, where 80% of the
         * height would otherwise leave a letterbox.
         */}
        <DialogContent
          showClose
          /* The close sits on the map itself, so it carries its own backing rather than relying
             on a dialog surface that is not there. */
          closeClassName="flex size-9 items-center justify-center rounded-lg bg-black/40 text-white hover:bg-black/60 hover:text-white [&_svg]:size-5"
          /*
           * `zoom-in-100` cancels the dialog's default scale-in. Mapbox measures its container as
           * it initialises, and a dialog still scaling up hands it a box smaller than the one it
           * settles at — the canvas is sized to that and never corrects, leaving a strip of the
           * dialog showing under the map.
           */
          className="h-4/5 max-h-200 min-h-100 w-4/5 max-w-none gap-0 overflow-hidden rounded-2xl p-0 data-open:zoom-in-100 data-closed:zoom-out-100"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {open ? <MapDialogCanvas point={point} title={title} zoom={DIALOG_ZOOM} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
