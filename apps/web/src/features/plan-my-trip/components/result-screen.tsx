"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { ArrowRight, Clock, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import EmptyState from "@/components/shared/feedback/empty-state";
import { WishlistButton } from "@/features/wishlist";
import { useMoney } from "@/hooks/use-money";
import { DRAW, GROUP, RISE, SPARK_START, SPARKS } from "@/lib/motion";

import { usePlannerRecommendation } from "../hooks/use-planner-recommendation";
import { buildConsultationHref } from "../lib/build-consultation-href";
import type { PlannerAnswers } from "../lib/search-params";
import { toBoatCardProps } from "../lib/to-boat-card";

/** No dedicated Spain photo exists yet — falls back to Greece, same as the backend's default. */
const DEFAULT_DESTINATION_IMAGE = "/assets/home/destinations/greece.webp";
const DESTINATION_IMAGES = new Map<string, string>([
  ["Croatia", "/assets/home/destinations/croatia.webp"],
  ["Greece", DEFAULT_DESTINATION_IMAGE],
  ["Italy", "/assets/home/destinations/italy.webp"],
]);

/** Result — "Your perfect yacht trip" (Figma node 959:344654), backed by `planner.recommend`. */
export function ResultScreen({ answers }: { answers: PlannerAnswers }) {
  const t = useTranslations("PlanMyTrip.result");
  const tv = useTranslations("PlanMyTrip.steps.tripVibe");
  const formatMoney = useMoney();
  const { data: recommendation, isPending, isError, refetch } = usePlannerRecommendation(answers);

  if (isPending) {
    return <ResultSkeleton />;
  }

  if (isError || !recommendation) {
    return (
      <EmptyState
        title={t("error.title")}
        description={t("error.description")}
        action={
          <Button variant="brand" onClick={() => refetch()}>
            {t("error.retry")}
          </Button>
        }
      />
    );
  }

  const style = tv(`options.${recommendation.style}.label`);
  const difficulty = t(`difficulty.${recommendation.difficulty}`);
  const skipper = t(recommendation.skipperRequired ? "skipper.yes" : "skipper.no");
  const duration = t("durationDays", { days: recommendation.durationDays });

  const { min, max } = recommendation.estimatedPrice;
  const price =
    min.amountMinor === max.amountMinor
      ? formatMoney(min.amountMinor)
      : `${formatMoney(min.amountMinor)}–${formatMoney(max.amountMinor)}`;

  const stats = [
    { label: t("labels.yachtType"), value: recommendation.yachtType },
    { label: t("labels.skipper"), value: skipper },
    { label: t("labels.style"), value: style },
    { label: t("labels.duration"), value: duration },
  ];

  const boatCard = recommendation.listing
    ? toBoatCardProps(recommendation.listing, formatMoney)
    : null;
  const destinationImage =
    DESTINATION_IMAGES.get(recommendation.destination.country) ?? DEFAULT_DESTINATION_IMAGE;
  // /yachts has no `guests`/`category`/`maxPriceMinor` filters, so only `country` deep-links.
  const countryHref = `/yachts?country=${encodeURIComponent(recommendation.destination.country)}`;

  return (
    <motion.div variants={GROUP} initial="hidden" animate="show" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-6">
        <span className="relative inline-flex">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-10 text-brand"
          >
            <motion.path variants={DRAW} d="M4 12l5 5L20 6" />
          </svg>
          <Sparkles />
        </span>

        <motion.div variants={RISE} className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-h4 text-foreground">{t("title")}</h1>
          <p className="text-body-xl text-natural-600">{t("subtitle")}</p>
        </motion.div>
      </div>

      <motion.div
        variants={RISE}
        className="flex flex-col overflow-hidden rounded-2xl bg-brand-50 lg:flex-row"
      >
        {/* Left — darkened destination photo with the recommended boat card floating on top.
            Below xl the photo takes half the row; the fixed Figma width only applies once
            there is room for the summary beside it. */}
        <div className="relative flex items-center justify-center overflow-hidden p-6 lg:w-1/2 lg:shrink xl:w-163">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={destinationImage} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
          {boatCard ? (
            <BoatSmallCard
              className="relative z-10 w-full max-w-83.5"
              image={boatCard.image}
              imageAlt={boatCard.imageAlt}
              location={boatCard.location}
              title={boatCard.title}
              rating={boatCard.rating}
              tags={boatCard.tags}
              price={boatCard.price}
              priceLabel={t("boat.from")}
              priceSuffix={t("boat.perPerson")}
              actionLabel={t("viewDetails")}
              actionRender={<Link href={boatCard.detailHref} />}
              saveRender={<WishlistButton listingId={boatCard.id} />}
            />
          ) : (
            <div className="relative z-10 flex w-full max-w-83.5 flex-col gap-3 rounded-2xl bg-card p-5 text-center">
              <p className="text-base font-semibold text-foreground">{t("noMatch.title")}</p>
              <p className="text-sm text-natural-600">{t("noMatch.description")}</p>
              <Button
                variant="neutral"
                size="sm"
                nativeButton={false}
                render={<Link href={countryHref} />}
              >
                {t("noMatch.seeAllMatches")}
              </Button>
            </div>
          )}
        </div>

        {/* Right — trip summary */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <h2 className="text-h4 text-foreground">
                <span aria-hidden>{recommendation.destination.flag}</span>{" "}
                {recommendation.destination.country}
              </h2>
              <div className="flex flex-wrap gap-3">
                <SummaryChip icon={<Clock className="size-4" />}>{duration}</SummaryChip>
                <SummaryChip icon={<TrendingUp className="size-4" />}>{difficulty}</SummaryChip>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {stats.map((stat) => (
                <StatCell key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl bg-card px-4 py-3">
              <StatLabel>{t("labels.estPrice")}</StatLabel>
              <div className="flex flex-wrap items-end gap-1.5">
                <span className="text-2xl leading-[1.1] font-semibold text-foreground">
                  {price}
                </span>
                <span className="text-base text-natural-600">{t("perPersonWeek")}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse flex-wrap gap-3 md:flex-row">
            <Button
              variant="neutral"
              className="w-full md:w-auto"
              nativeButton={false}
              render={<Link href={buildConsultationHref(answers)} />}
            >
              {t("getConsultation")}
            </Button>
            {boatCard ? (
              <Button
                variant="brand"
                className="w-full md:w-auto"
                nativeButton={false}
                render={<Link href={boatCard.detailHref} />}
              >
                {t("viewDetails")}
                <ArrowRight />
              </Button>
            ) : null}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Mirrors the loaded layout's shape so reaching step 7 doesn't jump once data arrives. */
function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-5 w-80 max-w-full rounded-lg" />
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl bg-brand-50 lg:flex-row">
        <div className="flex items-center justify-center p-6 lg:w-1/2 lg:shrink xl:w-163">
          <Skeleton className="h-90 w-full max-w-83.5 rounded-2xl" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, index) => (
                // eslint-disable-next-line react/no-array-index-key -- static skeleton placeholders
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-16 rounded-xl" />
          </div>
          <div className="flex flex-col-reverse gap-3 md:flex-row">
            <Skeleton className="h-11 w-full rounded-lg md:w-40" />
            <Skeleton className="h-11 w-full rounded-lg md:w-40" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkles() {
  const reduced = useReducedMotion();

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {SPARKS.map((spark) => (
        <motion.span
          key={`${spark.x}:${spark.y}`}
          className="absolute top-1/2 left-1/2 rounded-full bg-brand"
          style={{ width: spark.size, height: spark.size }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={
            reduced
              ? { opacity: 0 }
              : { x: spark.x, y: spark.y, scale: [0, 1, 0], opacity: [0, 1, 0] }
          }
          transition={{ duration: 0.6, delay: SPARK_START + spark.delay, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm leading-[1.3] tracking-[0.04em] text-natural-700 uppercase">
      {children}
    </span>
  );
}

function StatCell({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl bg-card px-4 py-3">
      <StatLabel>{label}</StatLabel>
      <span className="text-base leading-tight font-semibold break-words text-foreground">
        {value}
      </span>
    </div>
  );
}

function SummaryChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded bg-card p-1.5 text-sm font-semibold text-brand">
      {icon}
      {children}
    </span>
  );
}
