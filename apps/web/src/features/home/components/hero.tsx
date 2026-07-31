"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { type DateRange } from "@yacht-charter/ui/components/form/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin, Search, Ship, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import DatePicker from "@/components/shared/date-picker";

/*
 * Hero — Figma "Main Page" hero (node 530:3101). Full-bleed sunset photo with a left headline
 * block, a right search card (Where to? / dates / boat / captain + Search), and a translucent
 * blurred stats bar overlapping the bottom. Desktop lays text + card side by side (2xl frame);
 * below that everything stacks. The card fields are the design-system Select/field primitives so
 * the look matches 1-в-1; Search routes to /yachts (real query wiring lands with the search work).
 */

const DESTINATIONS = ["croatia", "greece", "italy", "turkey", "caribbean", "thailand"] as const;
const BOAT_TYPES = ["catamaran", "sailingYacht", "motorYacht", "gulet", "luxuryYacht"] as const;
const CAPTAIN_OPTIONS = ["withCaptain", "bareboat", "skippered"] as const;

const STATS = ["yachts", "destinations", "travelers", "rating"] as const;

type HeroOptionKey =
  | (typeof DESTINATIONS)[number]
  | (typeof BOAT_TYPES)[number]
  | (typeof CAPTAIN_OPTIONS)[number];

function HeroSelect({
  icon,
  placeholder,
  options,
}: {
  icon: React.ReactNode;
  placeholder: string;
  options: readonly HeroOptionKey[];
}) {
  const t = useTranslations("Home.Hero.options");

  return (
    <Select>
      <SelectTrigger className="h-12 min-w-0">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {t(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SearchCard() {
  const t = useTranslations("Home.Hero");
  const [range, setRange] = useState<DateRange | undefined>();

  return (
    <div className="mx-auto w-full max-w-[489px] shrink-0 rounded-2xl bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] xl:mx-0 xl:w-[438px]">
      <div className="flex flex-col gap-4">
        <HeroSelect
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
          placeholder={t("wherePlaceholder")}
          options={DESTINATIONS}
        />

        <DatePicker
          mode="range"
          value={range}
          onValueChange={setRange}
          placeholder={t("datesPlaceholder")}
          clearLabel={t("clearDates")}
        />

        <HeroSelect
          icon={<Ship className="size-6 shrink-0 text-foreground" />}
          placeholder={t("boatPlaceholder")}
          options={BOAT_TYPES}
        />
        <HeroSelect
          icon={<Users className="size-6 shrink-0 text-foreground" />}
          placeholder={t("captainPlaceholder")}
          options={CAPTAIN_OPTIONS}
        />

        <Button
          variant="brand"
          size="md"
          className="w-full"
          nativeButton={false}
          render={<Link href="/yachts" />}
        >
          <Search className="size-5" />
          {t("search")}
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-base md:justify-start md:text-left">
        <span className="text-natural-600">{t("dontKnow")}</span>
        <Link
          href="/yachts"
          className="font-medium text-brand underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {t("helpPlan")}
        </Link>
      </div>
    </div>
  );
}

function StatsBar() {
  const t = useTranslations("Home.Hero.stats");

  return (
    <div className="mx-auto w-full max-w-[1160px] rounded-2xl bg-black/15 py-6 backdrop-blur-md md:py-0">
      <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 md:gap-y-0">
        {STATS.map((stat, index) => (
          <div
            key={stat}
            className={cn(
              "flex flex-col items-center gap-2 py-0 text-center text-white md:px-2 md:py-6 xl:px-6",
              index % 2 === 0 ? "pr-2" : "pl-2",
              index % 2 === 1 && "border-l border-white/20",
              index > 0 && "md:border-l md:border-white/20",
            )}
          >
            <span className="text-[28px] leading-[1.1] font-medium md:text-[32px]">
              {t(`${stat}.value`)}
            </span>
            <span className="text-base leading-[1.4] text-white/90 md:text-xl md:leading-[1.1]">
              {t(`${stat}.label`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  const t = useTranslations("Home.Hero");

  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="/assets/hero/hero-yacht.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 transform-gpu object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[560px] flex-col gap-8 px-4 pt-10 pb-10 md:px-[54px] md:pt-[70px] md:pb-[65px] xl:min-h-[760px] xl:gap-10 xl:px-[70px] xl:pt-[100px] xl:pb-[60px]">
        <div className="flex flex-1 flex-col items-center gap-8 xl:flex-row xl:items-start xl:justify-between xl:gap-10">
          <div className="flex w-full max-w-[659px] flex-col gap-3 text-center text-white xl:w-auto xl:max-w-[450px] xl:text-left">
            <p className="text-base leading-[1.4] md:text-xl">{t("tagline")}</p>
            <h1 className="text-[50px] leading-[1.1] font-bold md:text-[64px] xl:text-[64px]">
              {t("heading")}
            </h1>
          </div>

          <SearchCard />
        </div>

        <StatsBar />
      </div>
    </section>
  );
}
