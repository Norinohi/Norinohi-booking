"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { ArrowRight, Clock, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";
import { yachtCardPrice } from "@/components/shared/data-display/yacht-card/view-model";
import EmptyState from "@/components/shared/feedback/empty-state";
import { buildSearchHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { dayToDisplay } from "@/lib/date";
import { DRAW, GROUP, RISE, SPARK_START, SPARKS } from "@/lib/motion";

import { usePlannerRecommendation } from "../hooks/use-planner-recommendation";
import { buildConsultationHref } from "../lib/build-consultation-href";
import type { PlannerAnswers } from "../lib/search-params";
import { toRecommendedTile } from "../lib/to-recommended-tile";

/** No dedicated Spain photo exists yet — falls back to Greece, same as the backend's default. */
const DEFAULT_DESTINATION_IMAGE = "/assets/home/destinations/greece.webp";
const DESTINATION_IMAGES = new Map<string, string>([
  ["Croatia", "/assets/home/destinations/croatia.webp"],
  ["Greece", DEFAULT_DESTINATION_IMAGE],
  ["Italy", "/assets/home/destinations/italy.webp"],
]);

const YACHT_TYPE_KEYS = new Map<string, "sailing" | "catamaran" | "gulet" | "motor" | "luxury">([
  ["Sailing yacht", "sailing"],
  ["Catamaran", "catamaran"],
  ["Gulet", "gulet"],
  ["Motor yacht", "motor"],
  ["Luxury yacht", "luxury"],
]);

/** Result — "Your perfect yacht trip" (Figma node 959:344654), backed by `planner.recommend`. */
interface ResultScreenProps {
  answers: PlannerAnswers;
}

export function ResultScreen({ answers }: ResultScreenProps) {
  const t = useTranslations("PlanMyTrip.result");
  const tv = useTranslations("PlanMyTrip.steps.tripVibe");
  const td = useTranslations("PlanMyTrip.steps.destination.options");
  const tCard = useTranslations("Common.boatCard");
  const tBadge = useTranslations("Common.boatCard.badges");
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
  const destinationKey = (["croatia", "greece", "italy", "spain"] as const).find(
    (key) => key === recommendation.searchParams.country[0],
  );
  const destinationLabel = destinationKey
    ? td(`${destinationKey}.label`)
    : recommendation.destination.country;
  const yachtTypeKey = YACHT_TYPE_KEYS.get(recommendation.yachtType);
  const yachtTypeLabel = yachtTypeKey ? t(`yachtType.${yachtTypeKey}`) : recommendation.yachtType;

  const { perPerson, fromBudgetAnswer } = recommendation.estimatedPrice;
  /** One money when both ends agree, so a fleet of one is not quoted as a range against itself. */
  const formatRange = (range: typeof perPerson) =>
    range.min.amountMinor === range.max.amountMinor
      ? formatMoney(range.min.amountMinor, range.min.currency)
      : `${formatMoney(range.min.amountMinor, range.min.currency)} – ${formatMoney(range.max.amountMinor, range.max.currency)}`;

  const stats = [
    { label: t("labels.yachtType"), value: yachtTypeLabel },
    { label: t("labels.skipper"), value: skipper },
    { label: t("labels.style"), value: style },
    { label: t("labels.duration"), value: duration },
  ];

  const listing = recommendation.listing;
  /*
   * The charter this price covers, off the listing itself rather than off the trip length.
   * Most of the fleet sells the week the estimate is quoted in, but a few sell three days,
   * and captioning one of those "price for 7 days" prices a charter nobody is selling.
   *
   * Where the two disagree the caption names the charter the figure does price, rather than a
   * length: the panel beside it says "DURATION 7 days" and the card was answering with "Price
   * for 1 day EUR 950", two claims about one trip that could not both be true. Nothing here can
   * reprice the difference - the rate list does not survive being prorated into another length
   * (see `read-model.ts`). Only a true season floor, with no charter behind it, says so.
   */
  const pricedWeek = listing?.priceIsFrom ? null : listing?.availability.bookablePeriod;
  const boatPriceLabel = !listing
    ? ""
    : !pricedWeek
      ? tCard("priceIndicative")
      : listing.priceDetails.periodDays === recommendation.durationDays
        ? tCard("priceFor", { days: listing.priceDetails.periodDays })
        : tCard("priceForPeriod", {
            from: dayToDisplay(pricedWeek.checkIn),
            to: dayToDisplay(pricedWeek.checkOut),
          });
  const boatPerPerson = recommendation.recommendedPerPerson
    ? t("price.perPerson", {
        price: formatMoney(
          recommendation.recommendedPerPerson.amountMinor,
          recommendation.recommendedPerPerson.currency,
        ),
      })
    : "";
  const boatCard = listing
    ? toRecommendedTile(tBadge, listing, destinationLabel, recommendation.period, {
        price: yachtCardPrice(tCard, listing, formatMoney),
        priceLabel: boatPriceLabel,
        priceSuffix: <span className="block">{boatPerPerson}</span>,
        actionLabel: t("viewDetails"),
      })
    : null;
  /*
   * Always a price per person, so it reads against the card's own second line rather than
   * against its total: the fleet's band where there is one, and the recommended charter's own
   * share where there is not. Never the budget answer, which is the visitor's own input and put
   * a figure on the screen that nothing on sale matches.
   */
  const priceLine = !fromBudgetAnswer
    ? {
        label: t("price.similar"),
        value: t("price.perPersonWeek", { range: formatRange(perPerson) }),
      }
    : listing && recommendation.recommendedPerPerson
      ? {
          label: t("price.estimate"),
          value: t("price.perPersonDays", {
            price: formatMoney(
              recommendation.recommendedPerPerson.amountMinor,
              recommendation.recommendedPerPerson.currency,
            ),
            days: listing.priceDetails.periodDays,
          }),
        }
      : null;
  const destinationImage =
    DESTINATION_IMAGES.get(recommendation.destination.country) ?? DEFAULT_DESTINATION_IMAGE;
  // Carry every successful constraint forward, including capacity and any relaxed filters.
  const {
    country,
    category,
    crew,
    guests,
    minBerths,
    duration: durationDays,
    maxPriceMinor,
  } = recommendation.searchParams;
  const matchesHref = buildSearchHref({
    guests,
    minBerths,
    country,
    boatType: category ? [category] : [],
    crew,
    duration: String(durationDays),
    ...(maxPriceMinor === null ? null : { price: [0, Math.round(maxPriceMinor / 100)] as const }),
  });

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
          <h2 className="text-h4 text-foreground">{t("title")}</h2>
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
            <YachtCard layout="tile" className="relative z-10 w-full max-w-83.5" {...boatCard} />
          ) : (
            <div className="relative z-10 flex w-full max-w-83.5 flex-col gap-3 rounded-2xl bg-card p-5 text-center">
              <p className="text-base font-semibold text-foreground">{t("noMatch.title")}</p>
              <p className="text-sm text-natural-600">{t("noMatch.description")}</p>
              <Button
                variant="neutral"
                size="sm"
                className="h-auto min-h-8 py-1 whitespace-normal"
                nativeButton={false}
                render={<Link href={matchesHref} />}
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
                <span aria-hidden>{recommendation.destination.flag}</span> {destinationLabel}
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

            {/*
              What a week costs on the yachts around this one, quoted in the same unit as the
              card's own second line so the two can be read against each other: the card's
              figure is one of the figures inside this band, because the range and the
              recommendation come off one filtered list. Where no comparable price exists the
              band would be the visitor's own budget answer, which prices nothing and read as a
              contradiction beside a card six times its size, so the yacht's own charter stands
              in its place instead.
            */}
            {priceLine ? (
              <div className="flex flex-col gap-0.5 rounded-xl bg-card px-4 py-3">
                <StatLabel>{priceLine.label}</StatLabel>
                <span className="text-lg leading-tight font-semibold wrap-break-word text-natural-600">
                  {priceLine.value}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse flex-wrap gap-3 md:flex-row">
            <Button
              variant="neutral"
              className="h-auto min-h-12 w-full py-3 whitespace-normal md:w-auto"
              nativeButton={false}
              render={<Link href={buildConsultationHref(answers)} />}
            >
              {t("getConsultation")}
            </Button>
            {boatCard ? (
              <>
                {/* One yacht is the recommendation; the rest of the brief's matches are a click away. */}
                <Button
                  variant="neutral"
                  className="h-auto min-h-12 w-full py-3 whitespace-normal md:w-auto"
                  nativeButton={false}
                  render={<Link href={matchesHref} />}
                >
                  {t("seeAllMatches")}
                </Button>
                <Button
                  variant="brand"
                  className="h-auto min-h-12 w-full py-3 whitespace-normal md:w-auto"
                  nativeButton={false}
                  render={<Link href={boatCard.detailHref} />}
                >
                  {t("viewDetails")}
                  <ArrowRight />
                </Button>
              </>
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
      <span className="text-base leading-tight font-semibold wrap-break-word text-foreground">
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
