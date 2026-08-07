"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { type DateRange } from "@yacht-charter/ui/components/form/calendar";
import { Select } from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin, Search, Ship, Users } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Suspense, useState } from "react";

import AnimatedNumber from "@/components/shared/data-display/animated-number";
import DatePicker from "@/components/shared/form/date-picker";
import { EMPTY_OPTIONS, type FilterOptions, useFilterOptions } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { dayFromNative, daysBetween } from "@/lib/date";
import { GROUP, RISE } from "@/lib/motion";

const STATS = [
  { key: "yachts", value: 30000, suffix: "+" },
  { key: "destinations", value: 1200, suffix: "+" },
  { key: "travelers", value: 20000, suffix: "+" },
  { key: "rating", value: 4.8, decimals: 1 },
] as const;

/*
 * The card's markup, with its option lists injected. Rendering this directly (with
 * EMPTY_OPTIONS) is also the Suspense fallback, so the shell and the resolved UI are literally
 * the same component — there is no separate skeleton to drift out of sync, and it stays correct
 * at every breakpoint for free.
 */
function SearchCardView({ options, isPending }: { options: FilterOptions; isPending: boolean }) {
  const t = useTranslations("Home.Hero");
  const [country, setCountry] = useState<string>();
  const [boatType, setBoatType] = useState<string>();
  const [crew, setCrew] = useState<string>();
  const [range, setRange] = useState<DateRange | undefined>();

  const href = buildSearchHref({
    country: country ? [country] : undefined,
    boatType: boatType ? [boatType] : undefined,
    crew: crew ? [crew] : undefined,
    startDate: range?.from ? dayFromNative(range.from) : undefined,
    duration: range?.from && range.to ? String(daysBetween(range.from, range.to)) : undefined,
  });

  return (
    <motion.div
      variants={RISE}
      className="mx-auto w-full max-w-122.25 shrink-0 rounded-2xl bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] xl:mx-0 xl:w-109.5"
    >
      <div className="flex flex-col gap-4">
        <Select
          className="h-12 min-w-0"
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
          placeholder={t("wherePlaceholder")}
          options={options.countries}
          value={country}
          onValueChange={setCountry}
          isLoading={isPending}
        />

        <DatePicker
          mode="range"
          value={range}
          onValueChange={setRange}
          placeholder={t("datesPlaceholder")}
          clearLabel={t("clearDates")}
        />

        <Select
          className="h-12 min-w-0"
          icon={<Ship className="size-6 shrink-0 text-foreground" />}
          placeholder={t("boatPlaceholder")}
          options={options.boatTypes}
          value={boatType}
          onValueChange={setBoatType}
          isLoading={isPending}
        />
        <Select
          className="h-12 min-w-0"
          icon={<Users className="size-6 shrink-0 text-foreground" />}
          placeholder={t("captainPlaceholder")}
          options={options.crews}
          value={crew}
          onValueChange={setCrew}
          isLoading={isPending}
        />

        <Button
          variant="brand"
          size="md"
          className="w-full"
          nativeButton={false}
          render={<Link href={href} />}
        >
          <Search className="size-5" />
          {t("search")}
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-base md:justify-start md:text-left">
        <span className="text-natural-600">{t("dontKnow")}</span>
        <Link
          href="/yachts"
          className="cursor-pointer font-medium text-brand underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {t("helpPlan")}
        </Link>
      </div>
    </motion.div>
  );
}

/*
 * Isolated because `useQuery` reads the clock on every render, which bars any component calling
 * it from the prerendered shell. Keeping that read in this leaf lets everything around it —
 * heading, imagery, stats — prerender.
 */
function SearchCard() {
  const { options, isPending } = useFilterOptions();

  return <SearchCardView options={options} isPending={isPending} />;
}

function StatsBar() {
  const t = useTranslations("Home.Hero.stats");

  return (
    <motion.div
      variants={RISE}
      className="mx-auto w-full max-w-290 rounded-2xl bg-black/15 py-6 backdrop-blur-md md:py-0"
    >
      <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 md:gap-y-0">
        {STATS.map((stat, index) => (
          <div
            key={stat.key}
            className={cn(
              "flex flex-col items-center gap-2 py-0 text-center text-white md:px-2 md:py-6 xl:px-6",
              index % 2 === 0 ? "pr-2" : "pl-2",
              index % 2 === 1 && "border-l border-white/20",
              index > 0 && "md:border-l md:border-white/20",
            )}
          >
            <AnimatedNumber
              value={stat.value}
              decimals={"decimals" in stat ? stat.decimals : 0}
              suffix={"suffix" in stat ? stat.suffix : undefined}
              delay={0.4}
              className="text-[28px] leading-[1.1] font-medium md:text-[32px]"
            />
            <span className="text-base leading-[1.4] text-white/90 md:text-xl md:leading-[1.1]">
              {t(`${stat.key}.label`)}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
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

      <motion.div
        variants={GROUP}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex min-h-140 max-w-384 flex-col gap-8 px-4 pt-10 pb-10 md:px-13.5 md:pt-17.5 md:pb-16.25 xl:min-h-190 xl:gap-10 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        <div className="flex flex-1 flex-col items-center gap-8 xl:flex-row xl:items-start xl:justify-between xl:gap-10">
          <motion.div
            variants={RISE}
            className="flex w-full max-w-164.75 flex-col gap-3 text-center text-white xl:w-auto xl:max-w-112.5 xl:text-left"
          >
            <p className="text-base leading-[1.4] md:text-xl">{t("tagline")}</p>
            <h1
              data-testid="home-shell-marker"
              className="text-[50px] leading-[1.1] font-bold md:text-[64px]"
            >
              {t("heading")}
            </h1>
          </motion.div>

          <Suspense fallback={<SearchCardView options={EMPTY_OPTIONS} isPending />}>
              <SearchCard />
            </Suspense>
        </div>

        <StatsBar />
      </motion.div>
    </section>
  );
}
