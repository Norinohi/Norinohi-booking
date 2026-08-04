"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
import { ArrowRight, Anchor, Clock, TrendingUp, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DRAW, GROUP, RISE, SPARK_START, SPARKS } from "@/lib/motion";

import type { Destination, PlannerAnswers } from "../lib/search-params";

/*
 * Result — "Your perfect yacht trip" (Figma node 959:344654, 3 breakpoints). The terminal screen
 * of the planner: a success check + legend over one recommendation card. The card's left half is a
 * darkened destination photo with a floating BoatSmallCard; the right half summarises the trip.
 *
 * The summary reflects the user's real answers (destination, style, duration, price). The
 * recommendation-only fields — yacht type, skipper, difficulty, and the specific boat — are
 * heuristics + placeholder data until a recommendation service exists (TODO).
 */
/* TODO: every card opens the same hardcoded detail page until listings carry a real id. */
const DETAIL_HREF = "/yachts/lagoon-42";

const DESTINATION_FLAGS: Record<Destination, string> = {
  greece: "🇬🇷",
  croatia: "🇭🇷",
  italy: "🇮🇹",
  spain: "🇪🇸",
  "not-sure": "🇬🇷",
};

export function ResultScreen({ answers }: { answers: PlannerAnswers }) {
  const t = useTranslations("PlanMyTrip.result");
  const td = useTranslations("PlanMyTrip.steps.destination");
  const tv = useTranslations("PlanMyTrip.steps.tripVibe");
  const tdur = useTranslations("PlanMyTrip.steps.duration");
  const tb = useTranslations("PlanMyTrip.steps.budget");
  const router = useRouter();

  const destinationName = (() => {
    switch (answers.destination) {
      case "croatia":
        return td("options.croatia.label");
      case "italy":
        return td("options.italy.label");
      case "spain":
        return td("options.spain.label");
      default:
        return td("options.greece.label"); // greece / not-sure / null → recommend Greece
    }
  })();
  const destinationFlag = DESTINATION_FLAGS[answers.destination ?? "greece"];

  const style = (() => {
    switch (answers.vibe) {
      case "adventure":
        return tv("options.adventure.label");
      case "relax":
        return tv("options.relax.label");
      case "luxury":
        return tv("options.luxury.label");
      case "party":
        return tv("options.party.label");
      default:
        return tv("options.family.label"); // family / null
    }
  })();

  const duration = (() => {
    switch (answers.duration) {
      case "7":
        return tdur("options.week.label");
      case "14":
        return tdur("options.twoWeeks.label");
      case "21-plus":
        return tdur("options.more.label");
      default:
        return tdur("options.threeWeeks.label"); // 21 / null
    }
  })();

  const price = (() => {
    switch (answers.budget) {
      case "600-1000":
        return tb("options.mid.label");
      case "1000-1200":
        return tb("options.high.label");
      case "2000-plus":
        return tb("options.premium.label");
      default:
        return tb("options.low.label"); // 300-600 / null
    }
  })();

  // Recommendation-only heuristics (placeholder until a real engine exists).
  const yachtType = (() => {
    switch (answers.groupSize) {
      case "2-4":
        return t("yachtType.sailing");
      case "9-plus":
        return t("yachtType.gulet");
      default:
        return t("yachtType.catamaran"); // 5-8 / not-sure / null
    }
  })();
  const skipper = answers.experience === "licensed" ? t("skipper.no") : t("skipper.yes");
  const difficulty = (() => {
    switch (answers.experience) {
      case "some":
        return t("difficulty.moderate");
      case "licensed":
        return t("difficulty.advanced");
      default:
        return t("difficulty.easy"); // none / null
    }
  })();

  const stats = [
    { label: t("labels.yachtType"), value: yachtType },
    { label: t("labels.skipper"), value: skipper },
    { label: t("labels.style"), value: style },
    { label: t("labels.duration"), value: duration },
  ];

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
        className="flex flex-col overflow-hidden rounded-2xl bg-brand-50 md:flex-row"
      >
        {/* Left — darkened destination photo with the recommended boat card floating on top */}
        <div className="relative flex items-center justify-center overflow-hidden p-6 md:w-[652px] md:shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/home/destinations/greece.webp"
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
          <BoatSmallCard
            className="relative z-10 w-full max-w-[334px]"
            image="/assets/home/boat-types/catamaran.webp"
            imageAlt={t("boat.title")}
            location={t("boat.location")}
            title={t("boat.title")}
            rating={5.9}
            tags={[
              { icon: <Anchor className="size-4" />, label: t("boat.tagBareboat") },
              { icon: <Users className="size-4" />, label: t("boat.tagFullCrew") },
            ]}
            price="€350"
            priceLabel={t("boat.from")}
            priceSuffix={t("boat.perPerson")}
            actionLabel={t("viewDetails")}
            actionRender={<Link href={DETAIL_HREF} />}
          />
        </div>

        {/* Right — trip summary */}
        <div className="flex flex-1 flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <h2 className="text-h4 text-foreground">
                <span aria-hidden>{destinationFlag}</span> {destinationName}
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

          <div className="flex flex-col-reverse gap-3 md:flex-row">
            <Button
              variant="neutral"
              className="w-full md:w-auto"
              onClick={() => router.push("/yachts")}
            >
              {t("getConsultation")}
            </Button>
            <Button
              variant="brand"
              className="w-full md:w-auto"
              nativeButton={false}
              render={<Link href={DETAIL_HREF} />}
            >
              {t("viewDetails")}
              <ArrowRight />
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
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
    <div className="flex flex-col gap-1.5 rounded-xl bg-card px-4 py-3">
      <StatLabel>{label}</StatLabel>
      <span className="text-base leading-[1.25] font-semibold text-foreground">{value}</span>
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
