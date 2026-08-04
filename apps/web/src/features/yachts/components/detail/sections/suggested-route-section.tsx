import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/data-display/image";

import DetailSection from "./detail-section";

const SUBTITLE = "7-day itinerary through the best of Central Dalmatia";

const DAYS = [
  { title: "Day 1 — Split", text: "Check-in and evening in the historic Diocletian's Palace." },
  {
    title: "Day 2 — Hvar",
    text: "Sail to the sunniest island, famous for lavender and nightlife.",
  },
  {
    title: "Day 3 — Vis",
    text: "Explore the remote military tunnels and authentic fishing charm.",
  },
  { title: "Day 4 — Blue Cave", text: "A magical natural phenomenon on the island of Biševo." },
  { title: "Day 5 — Korčula", text: "Check-in and evening in the historic Diocletian's Palace." },
  { title: "Day 6 — Bra", text: "Sail to the sunniest island, famous for lavender and nightlife." },
  {
    title: "Day 7 — Split",
    text: "Explore the remote military tunnels and authentic fishing charm.",
  },
] as const;

const COLUMNS = [DAYS.slice(0, 4), DAYS.slice(4)];

function DayList({ days }: { days: readonly (typeof DAYS)[number][] }) {
  return (
    <ol className="relative flex min-w-0 flex-1 flex-col ">
      <span aria-hidden className="absolute inset-y-2 left-0.5 w-3 rounded-full bg-brand-50/50" />
      <span
        aria-hidden
        className="absolute inset-y-2 left-1.5 border-l-4 border-dotted border-brand-100"
      />

      {days.map((day, index) => (
        <li key={day.title} className="flex gap-4">
          <div className="flex w-4 shrink-0 justify-center">
            <span className="relative size-4 shrink-0 rounded-full border-2 border-brand bg-card" />
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-1.5",
              index < days.length - 1 && "pb-10.5",
            )}
          >
            <h3 className="text-xl leading-6.5 font-bold text-foreground">{day.title}</h3>
            <p className="text-base leading-5.5 text-foreground">{day.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function SuggestedRouteSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="suggested-route" title={t("sections.suggestedRoute")}>
      <div className="flex flex-col gap-3">
        <p className="text-xl text-foreground">{SUBTITLE}</p>

        <Image
          src="/assets/yachts/route-map.png"
          alt=""
          width={1042}
          height={435}
          sizes="(min-width: 1280px) 1042px, 100vw"
          className="h-78 w-full rounded-2xl object-cover md:h-108.75"
        />

        <div className="flex flex-col gap-10 pt-3 md:flex-row md:items-start">
          {COLUMNS.map((column) => (
            <DayList key={column[0]?.title} days={column} />
          ))}
        </div>
      </div>
    </DetailSection>
  );
}
