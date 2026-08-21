"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowUpRight, Globe, Mail, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import MapPreview from "./map-preview";

const withProtocol = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

export type Coordinates = { lat: number; lng: number };

export type Marina = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  coordinates: Coordinates;
  mapImageUrl?: string;
};

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center text-foreground">
        {icon}
      </span>
      <span className="truncate text-sm font-medium leading-[1.3] text-foreground">{children}</span>
    </div>
  );
}

export type MarinaCardProps = {
  marina: Marina;
  className?: string;
  /** Told when the map dialog opens, so a hover-opened host can hold itself open. */
  onMapOpenChange?: (open: boolean) => void;
};

export function MarinaCard({ marina, className, onMapOpenChange }: MarinaCardProps) {
  return (
    <article className={cn("w-full overflow-hidden rounded-2xl", className)}>
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-4">
        <MapPreview
          point={marina.coordinates}
          title={marina.name}
          imageUrl={marina.mapImageUrl}
          imageSizes="(min-width: 768px) 228px, 100vw"
          onOpenChange={onMapOpenChange}
          className="h-41 w-full shrink-0 md:h-auto md:w-57"
          /* Smaller than the default disc, but the standard white: this map is 228px wide, and the
             faint one it used to carry disappeared once the basemap became satellite imagery. */
          pinClassName="size-16"
          popup={<MarinaDetails marina={marina} className="w-72 rounded-2xl bg-card p-4" />}
        />

        <MarinaDetails marina={marina} className="flex-1 px-4 py-4 md:pl-0" />
      </div>
    </article>
  );
}

/**
 * A marina in words — everything the card shows beside its map.
 *
 * Its own component because the same block is what a pin opens inside the map dialog, and the card
 * cannot be reused there: the card contains that very map, so nesting it would recurse.
 */
export function MarinaDetails({ marina, className }: { marina: Marina; className?: string }) {
  const t = useTranslations("Common.marina");

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5 md:gap-2">
        <p className="truncate text-base font-bold leading-[1.4] text-foreground">{marina.name}</p>
        <p className="text-base leading-[1.4] text-natural-500">
          {[marina.address, marina.city, marina.country].filter(Boolean).join(", ")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        {marina.phone ? (
          <ContactRow icon={<Smartphone className="size-6" />}>{marina.phone}</ContactRow>
        ) : null}
        {marina.website ? (
          <ContactRow icon={<Globe className="size-6" />}>{marina.website}</ContactRow>
        ) : null}
        {marina.email ? (
          <ContactRow icon={<Mail className="size-6" />}>{marina.email}</ContactRow>
        ) : null}
      </div>

      {marina.website ? (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <a href={withProtocol(marina.website)} target="_blank" rel="noopener noreferrer" />
          }
          className="w-fit capitalize"
        >
          {t("viewDetails")}
          <ArrowUpRight className="size-4 shrink-0" />
        </Button>
      ) : null}
    </div>
  );
}

function formatLocation(marina: Marina): string {
  return [marina.name, marina.city, marina.country].join(", ");
}

export type MarinaPopoverProps = {
  marina: Marina;
  className?: string;
};

export function MarinaPopover({ marina, className }: MarinaPopoverProps) {
  const [hovered, setHovered] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  /*
   * Held open while the map dialog is up.
   *
   * The popover opens on hover, and reaching the dialog means leaving it — which would close the
   * popover, unmount its content, and take the dialog rendered inside it along. Keeping the
   * popover open behind the dialog's backdrop costs nothing visually and keeps the map mounted;
   * it closes on its own once the dialog does.
   */
  return (
    <Popover open={hovered || mapOpen} onOpenChange={setHovered}>
      <PopoverTrigger
        openOnHover
        delay={200}
        closeDelay={100}
        className={cn(
          "max-w-full w-fit truncate rounded-sm text-left text-base font-bold leading-[1.4] text-foreground underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
      >
        {formatLocation(marina)}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        backdrop
        className="w-150.25 max-w-[calc(100vw-2rem)] overflow-visible rounded-2xl border-0 p-0 shadow-[4px_4px_15px_rgba(0,0,0,0.03)]"
      >
        <PopoverArrow className="before:border-0" />
        <MarinaCard marina={marina} onMapOpenChange={setMapOpen} />
      </PopoverContent>
    </Popover>
  );
}
