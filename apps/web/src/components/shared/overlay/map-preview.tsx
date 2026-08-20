"use client";

import { Dialog, DialogContent, DialogTitle } from "@yacht-charter/ui/components/overlay/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Map as MapIcon, Maximize2, MapPin, Satellite } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Image } from "@/components/shared/data-display/image";
import {
  MAP_STYLE_KEYS,
  MapStyleProvider,
  type MapStyleKey,
} from "@/components/shared/data-display/map-canvas";
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

/* Fixed white, not theme tokens: satellite tiles do not follow the app's theme. */
const CONTROL_PLATE =
  "flex items-center justify-center rounded-lg bg-white text-natural-900 shadow-[0_1px_6px_rgba(0,0,0,0.45)] transition-colors";

type CommonProps = {
  /** Names the place in the dialog's heading and in the trigger's accessible name. */
  title: string;
  /** The `sizes` hint for the still, which differs per slot. */
  imageSizes: string;
  /** Sizes the still. The dialog is sized by the dialog. */
  className?: string;
  pinClassName?: string;
  /** Reported so a hover-opened surface hosting this can stay open while the map is up. */
  onOpenChange?: (open: boolean) => void;
  /** Drawn over the still, under the hover chrome — the marks a multi-place still needs. */
  overlay?: ReactNode;
};

/*
 * Two shapes, because a place and a route are not the same preview.
 *
 * A place needs only its coordinates: the still and the map behind it both follow from them. A
 * route has several, so its caller draws its own still and supplies the map to open — which is
 * `RouteMap`, markers, popups and all, rather than the single pin this renders by default.
 */
export type MapPreviewProps = CommonProps &
  (
    | {
        point: Coordinates;
        /** Zoom for the still. The dialog opens closer — see `DIALOG_ZOOM`. */
        zoom?: number;
        /** Dimensions for the Mapbox still, e.g. "500x236@2x". */
        imageSize?: string;
        /** A ready-made still, where one was stored with the record. */
        imageUrl?: string;
        children?: undefined;
      }
    | {
        point?: undefined;
        zoom?: undefined;
        imageSize?: undefined;
        imageUrl: string;
        /** What the dialog shows. Mounted only while it is open. */
        children: ReactNode;
      }
  );

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
const STYLE_ICON = { satellite: Satellite, streets: MapIcon };

/** Two buttons over the map, the way a mapping site offers the same choice. */
function StyleSwitch({
  value,
  onChange,
}: {
  value: MapStyleKey;
  onChange: (next: MapStyleKey) => void;
}) {
  const t = useTranslations("Common.map");

  return (
    /* Inset matched to the dialog's own close button, which sits at `top-4 right-4`. */
    <div className="absolute top-4 left-4 z-10 flex overflow-hidden rounded-lg bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
      {MAP_STYLE_KEYS.map((key) => {
        const Icon = STYLE_ICON[key];

        return (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            onClick={() => onChange(key)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
              key === value
                ? "bg-brand text-brand-foreground"
                : "text-natural-900 hover:bg-natural-50",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}

export default function MapPreview(props: MapPreviewProps) {
  const { title, imageSizes, className, pinClassName, onOpenChange, overlay } = props;
  const t = useTranslations("Common.map");
  const [open, setOpen] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("satellite");

  /*
   * Narrowed on `point` rather than destructured: the two shapes decide both halves together, and
   * reading them apart loses the link between the still and the map it opens.
   */
  const { still, dialogBody, showPin } = props.point
    ? {
        still:
          props.imageUrl ??
          staticMapUrl(
            props.point,
            props.imageSize
              ? { zoom: props.zoom ?? 13, size: props.imageSize }
              : { zoom: props.zoom ?? 13 },
          ),
        dialogBody: <MapDialogCanvas point={props.point} title={title} zoom={DIALOG_ZOOM} />,
        /* One place, so this marks it. A route's still carries a pin per stop already. */
        showPin: true,
      }
    : { still: props.imageUrl, dialogBody: props.children, showPin: false };

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
        <Image src={still} alt="" fill unoptimized sizes={imageSizes} className="object-cover" />

        {/* Lifts on hover, so the still reads as a way in rather than a decoration. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/5"
        />
        {overlay}

        {showPin ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 left-1/2 flex size-21 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25 transition-transform group-hover:scale-110",
              pinClassName,
            )}
          >
            <MapPin className="size-6 fill-brand text-white" />
          </span>
        ) : null}
        {/*
         * Always on show. Revealed on hover it was invisible on a phone, and even with a pointer
         * it only answered the question after the visitor had already guessed the answer — this
         * is the one mark that says the still is a way in rather than a picture.
         */}
        <span
          aria-hidden
          className={`${CONTROL_PLATE} absolute right-3 bottom-3 size-7 group-hover:bg-natural-50`}
        >
          <Maximize2 className="size-3.5" />
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
          /* The close sits on the map itself, so it carries its own backing. */
          closeClassName={`${CONTROL_PLATE} size-9 hover:bg-natural-50 hover:text-natural-900 [&_svg]:size-5`}
          /*
           * `zoom-in-100` cancels the dialog's default scale-in. Mapbox measures its container as
           * it initialises, and a dialog still scaling up hands it a box smaller than the one it
           * settles at — the canvas is sized to that and never corrects, leaving a strip of the
           * dialog showing under the map.
           */
          className="h-4/5 max-h-200 min-h-100 w-4/5 max-w-none gap-0 overflow-hidden rounded-2xl p-0 data-open:zoom-in-100 data-closed:zoom-out-100"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {open ? (
            <>
              <StyleSwitch value={styleKey} onChange={setStyleKey} />
              <MapStyleProvider value={styleKey}>{dialogBody}</MapStyleProvider>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
