"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselNav,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import { useQuery } from "@tanstack/react-query";
import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { Activity, ArrowUpRight, ChevronUp, Clock } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import { Image } from "@/components/shared/data-display/image";
import { buildSearchHref, type SearchCriteria } from "@/features/yachts";
import { Link } from "@/i18n/navigation";
import { RISE, VIEWPORT } from "@/lib/motion";

import { popularRoutesQueryOptions } from "../api/queries";

type PopularRoute = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["popularRoutes"]>
>["routes"][number];

/** How many routes the slider shows before "View All Popular". */
const SLIDER_COUNT = 6;

function usePopularRoutes(): PopularRoute[] {
  const locale = useLocale();
  const { data } = useQuery(popularRoutesQueryOptions(locale));
  return data?.routes ?? [];
}

/*
 * There are no route pages yet, so a card lands on the catalogue filtered to the route's country,
 * sailing area (or starting marina) and length -- the boats that could actually sail it.
 */
function RouteCard({ route }: { route: PopularRoute }) {
  const t = useTranslations("Home.SailingRoutes");
  const criteria: SearchCriteria = { duration: String(route.nights) };
  if (route.countryValue) criteria.country = [route.countryValue];
  if (route.sailingAreaValue) criteria.sailingArea = [route.sailingAreaValue];
  if (route.marinaValue) criteria.marina = [route.marinaValue];
  const href = buildSearchHref(criteria);

  return (
    <TripCard
      imageRender={
        <>
          {route.imageUrl ? (
            <Image
              src={route.imageUrl}
              alt={route.title}
              fill
              sizes="(min-width: 1024px) 452px, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-natural-200" />
          )}
          {route.countryLabel && (
            <>
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent" />
              <span className="absolute bottom-4 left-4 text-xl font-semibold text-white">
                {route.countryLabel}
              </span>
            </>
          )}
        </>
      }
      title={
        <Link
          href={href}
          className="rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {route.title}
        </Link>
      }
      description={route.description ?? undefined}
      actionLabel={t("exploreRoute")}
      actionRender={<Link href={href} />}
      meta={[
        { label: t("days", { count: route.nights }), icon: <Clock /> },
        ...(route.difficulty
          ? [{ label: t(`levels.${route.difficulty}`), icon: <Activity /> }]
          : []),
      ]}
      className="h-full w-full"
      descriptionClassName="line-clamp-3"
    />
  );
}

/* Isolated like the other home sliders, so `useQuery`'s clock read stays out of the static shell. */
function RouteSlides() {
  const routes = usePopularRoutes().slice(0, SLIDER_COUNT);

  return (
    <>
      {routes.map((route) => (
        <CarouselSlide
          key={route.id}
          className="basis-[85%] pr-5 sm:basis-1/2 md:basis-113 lg:basis-1/3 xl:basis-113"
        >
          <RouteCard route={route} />
        </CarouselSlide>
      ))}
    </>
  );
}

function RouteGrid() {
  const routes = usePopularRoutes();

  return (
    <div className="grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
      {routes.map((route) => (
        <RouteCard key={route.id} route={route} />
      ))}
    </div>
  );
}

export default function SailingRoutes() {
  const t = useTranslations("Home.SailingRoutes");
  const [expanded, setExpanded] = useState(false);

  const heading = <h2 className="text-h2 text-foreground">{t("heading")}</h2>;
  const toggle = (
    <div className="flex justify-center px-4 md:px-13.5 xl:px-17.5">
      <Button
        variant="neutral"
        size="md"
        className="w-full md:w-auto"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? t("showLess") : t("seeAll")}
        {expanded ? <ChevronUp /> : <ArrowUpRight />}
      </Button>
    </div>
  );

  return (
    <section className="w-full">
      <div className="mx-auto max-w-384 pt-10 pb-10 md:pt-17.5 md:pb-17.25 xl:pt-25 xl:pb-25">
        {expanded ? (
          <div className="flex flex-col gap-8 xl:gap-10">
            <div className="px-4 md:px-13.5 xl:px-17.5">{heading}</div>
            <div className="px-4 md:px-13.5 xl:px-17.5">
              <Suspense fallback={null}>
                <RouteGrid />
              </Suspense>
            </div>
            {toggle}
          </div>
        ) : (
          <Carousel options={{ align: "start" }} className="flex flex-col gap-8 xl:gap-10">
            <motion.div
              variants={RISE}
              initial="hidden"
              whileInView="show"
              viewport={VIEWPORT}
              className="flex items-center justify-between gap-4 px-4 md:px-13.5 xl:px-17.5"
            >
              {heading}
              <CarouselNav previousLabel={t("previous")} nextLabel={t("next")} />
            </motion.div>

            <CarouselViewport className="pl-4 md:pl-13.5 xl:pl-17.5">
              <Suspense fallback={null}>
                <RouteSlides />
              </Suspense>
            </CarouselViewport>

            {toggle}
          </Carousel>
        )}
      </div>
    </section>
  );
}
