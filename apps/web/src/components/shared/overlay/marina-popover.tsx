"use client";

import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowUpRight, Globe, Mail, MapPin, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Image } from "@/components/shared/data-display/image";
import { staticMapUrl } from "@/lib/mapbox";

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
};

export function MarinaCard({ marina, className }: MarinaCardProps) {
  const t = useTranslations("Common.marina");

  return (
    <article className={cn("w-full overflow-hidden rounded-2xl", className)}>
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-4">
        <div className="relative h-41 w-full shrink-0 md:h-auto md:w-57">
          <Image
            src={marina.mapImageUrl ?? staticMapUrl(marina.coordinates)}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 768px) 228px, 100vw"
            className="object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-black/40" />

          <div
            aria-hidden
            className="absolute top-1/2 left-1/2 flex size-27.6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/12 bg-white/12"
          >
            <MapPin className="size-6 fill-brand text-white" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:pl-0">
          <div className="flex flex-col gap-1.5 md:gap-2">
            <p className="truncate text-base font-bold leading-[1.4] text-foreground">
              {marina.name}
            </p>
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

          <button
            type="button"
            className="flex w-fit items-center gap-1.5 rounded-lg px-4 py-1.5 text-base font-semibold capitalize leading-[1.25] text-foreground outline-none hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {t("viewDetails")}
            <ArrowUpRight className="size-4 shrink-0" />
          </button>
        </div>
      </div>
    </article>
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
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={200}
        closeDelay={100}
        className={cn(
          "max-w-full truncate rounded-sm text-left text-base font-bold leading-[1.4] text-foreground underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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
        <MarinaCard marina={marina} />
      </PopoverContent>
    </Popover>
  );
}
