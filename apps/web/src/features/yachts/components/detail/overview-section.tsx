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

import DetailSection from "./detail-section";

/*
 * Reading order, matching Figma 967:69738. Two columns fill it row by row from md up; below that
 * the grid collapses to the single column of 969:60304 and the same order reads straight down.
 */
const ITEMS = [
  { key: "location", icon: <MapPin />, value: "Split, Croatia" },
  { key: "mainsail", icon: <Sailboat />, value: "Classic mainsail" },
  { key: "year", icon: <Calendar />, value: "2022" },
  { key: "draught", icon: <MoveVertical />, value: "1.25m" },
  { key: "boatType", icon: <Ship />, value: "Catamaran" },
  { key: "beam", icon: <MoveHorizontal />, value: "7.7m" },
  { key: "cabins", icon: <DoorClosed />, value: "4 double" },
  { key: "fuelTank", icon: <Fuel />, value: "600 l" },
  { key: "bathrooms", icon: <Bath />, value: "4" },
  { key: "waterTank", icon: <Droplets />, value: "600 l" },
  { key: "length", icon: <MoveDiagonal />, value: "12.5 ft" },
  { key: "engine", icon: <Cog />, value: "85 kw" },
] as const;

export default function OverviewSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="overview" title={t("sections.overview")}>
      {/* The zebra stripe follows the visual row, so it alternates per item in one column and per
          pair in two. Cell padding stands in for a column gap to keep each stripe unbroken. */}
      <div className="grid md:grid-cols-2">
        {ITEMS.map((item, index) => (
          <div
            key={item.key}
            className={cn(
              "flex min-w-0 items-center gap-2 py-3 pl-3 md:pl-2 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-brand",
              index % 2 === 0 && "md:pr-2",
              index % 2 === 1 && "max-md:bg-natural-50",
              Math.floor(index / 2) % 2 === 1 && "md:bg-natural-50",
            )}
          >
            {item.icon}
            <span className="shrink-0 text-sm font-semibold tracking-wide text-foreground">
              {t(`overview.${item.key}`)}:
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
