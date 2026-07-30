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

/* Left column top-to-bottom paired with the right column, matching Figma node 967:69738. */
const ROWS = [
  [
    { key: "location", icon: <MapPin />, value: "Split, Croatia" },
    { key: "mainsail", icon: <Sailboat />, value: "Classic mainsail" },
  ],
  [
    { key: "year", icon: <Calendar />, value: "2022" },
    { key: "draught", icon: <MoveVertical />, value: "1.25m" },
  ],
  [
    { key: "boatType", icon: <Ship />, value: "Catamaran" },
    { key: "beam", icon: <MoveHorizontal />, value: "7.7m" },
  ],
  [
    { key: "cabins", icon: <DoorClosed />, value: "4 double" },
    { key: "fuelTank", icon: <Fuel />, value: "600 l" },
  ],
  [
    { key: "bathrooms", icon: <Bath />, value: "4" },
    { key: "waterTank", icon: <Droplets />, value: "600 l" },
  ],
  [
    { key: "length", icon: <MoveDiagonal />, value: "12.5 ft" },
    { key: "engine", icon: <Cog />, value: "85 kw" },
  ],
] as const;

export default function OverviewSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="overview" title={t("sections.overview")}>
      <div className="flex flex-col">
        {ROWS.map((row, index) => (
          <div
            key={row[0].key}
            className={cn("flex items-center gap-4 py-3", index % 2 === 1 && "bg-natural-50")}
          >
            {row.map((item, position) => (
              <div
                key={item.key}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-brand",
                  position === 0 && "pl-2",
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
        ))}
      </div>
    </DetailSection>
  );
}
