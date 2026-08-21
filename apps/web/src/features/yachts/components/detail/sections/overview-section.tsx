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

/**
 * The read model's `code` to this section's message key.
 *
 * The two spellings differ because the codes are kebab-case in the API and the messages are
 * camelCase like every other key in the file; a code with no entry falls back to the English
 * label the read model still carries, so a new spec row renders rather than throwing.
 */
type OverviewLabelKey =
  | "location"
  | "year"
  | "boatType"
  | "cabins"
  | "bathrooms"
  | "showers"
  | "length"
  | "mainsail"
  | "draught"
  | "beam"
  | "fuelTank"
  | "waterTank"
  | "engine";

const OVERVIEW_LABEL_KEY = new Map<string, OverviewLabelKey>([
  ["location", "location"],
  ["year", "year"],
  ["boat-type", "boatType"],
  ["cabins", "cabins"],
  ["bathrooms", "bathrooms"],
  ["showers", "showers"],
  ["length", "length"],
  ["mainsail", "mainsail"],
  ["draught", "draught"],
  ["beam", "beam"],
  ["fuel-tank", "fuelTank"],
  ["water-tank", "waterTank"],
  ["engine", "engine"],
]);

const OVERVIEW_ICON = new Map<string, ReactNode>(
  Object.entries({
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
  }),
);

export default function OverviewSection() {
  const t = useTranslations("YachtDetail");
  const tOverview = useTranslations("YachtDetail.overview");
  const { data } = useListingDetail();

  if (!data) return null;

  const labelOf = (code: string, fallback: string) => {
    const key = OVERVIEW_LABEL_KEY.get(code);
    return key ? tOverview(key) : fallback;
  };

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
            {OVERVIEW_ICON.get(item.code)}
            <span className="shrink-0 text-sm font-semibold tracking-wide text-foreground">
              {labelOf(item.code, item.label)}:
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-natural-600">
              {item.value ?? tOverview("notSpecified")}
            </span>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
