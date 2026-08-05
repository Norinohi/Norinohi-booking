"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import {
  Bath,
  Calendar,
  Cog,
  DoorClosed,
  Droplets,
  Fuel,
  MapPin,
  MoveDiagonal,
  MoveHorizontal,
  MoveVertical,
  Sailboat,
  Ship,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

const OVERVIEW_ICON: Record<string, ReactNode> = {
  location: <MapPin />,
  mainsail: <Sailboat />,
  year: <Calendar />,
  draught: <MoveVertical />,
  "boat-type": <Ship />,
  beam: <MoveHorizontal />,
  cabins: <DoorClosed />,
  "fuel-tank": <Fuel />,
  bathrooms: <Bath />,
  "water-tank": <Droplets />,
  length: <MoveDiagonal />,
  engine: <Cog />,
};

export default function OverviewSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="overview" title={t("sections.overview")}>
      <div className="grid md:grid-cols-2">
        {data.overview.map((item, index) => (
          <div
            key={item.code}
            className={cn(
              "flex min-w-0 items-center gap-2 py-3 pl-3 md:pl-2 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-brand",
              index % 2 === 0 && "md:pr-2",
              index % 2 === 1 && "max-md:bg-natural-50",
              Math.floor(index / 2) % 2 === 1 && "md:bg-natural-50",
            )}
          >
            {OVERVIEW_ICON[item.code]}
            <span className="shrink-0 text-sm font-semibold tracking-wide text-foreground">
              {item.label}:
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-natural-600">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
