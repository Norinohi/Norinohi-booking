"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselNav,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { DestinationCard } from "@yacht-charter/ui/components/data-display/card-destination";
import { Image } from "@/components/shared/data-display/image";
import { ArrowUpRight, ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { Link } from "@/i18n/navigation";

import { type Option, useFilterOptions } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { RISE, VIEWPORT } from "@/lib/motion";

/** How many featured destinations the slider shows before "View All Popular". */
const SLIDER_COUNT = 6;
/** The grid behind the button: three columns by four rows. */
const GRID_COUNT = 12;

/*
 * The curated destinations in their editorial order, or every country when nobody has curated
 * any -- a fresh database should still show a slider rather than an empty band.
 */
function useFeaturedCountries(): Option[] {
  const { options } = useFilterOptions();
  const featured = options.countries
    .flatMap((country) =>
      country.featuredRank == null ? [] : [{ country, rank: country.featuredRank }],
    )
    .sort((left, right) => left.rank - right.rank)
    .map(({ country }) => country);

  return featured.length > 0 ? featured : options.countries;
}

const TILE_SIZES = "(min-width: 768px) 420px, (min-width: 640px) 48vw, 85vw";

/*
 * `withHoverImage` is the slider's six: they lead with the yacht under the flag and cross-fade to
 * the place from above under the cursor, or on keyboard focus. The expanded grid has no hover and
 * shows one photo: the second one where an editor ticked "use in the grid", the first otherwise.
 */
function DestinationTile({
  country,
  withHoverImage = false,
}: {
  country: Option;
  withHoverImage?: boolean;
}) {
  const t = useTranslations("Home.PopularDestinations");
  const money = useMoney();
  const price = country.pricePerPersonWeekMinor;
  const gridImage =
    !withHoverImage && country.gridUsesHoverImage !== false && country.hoverImageUrl
      ? country.hoverImageUrl
      : country.imageUrl;

  return (
    <Link
      href={buildSearchHref({ country: [country.value] })}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <DestinationCard
        imageRender={
          gridImage ? (
            <>
              <Image
                src={gridImage}
                alt={country.label}
                fill
                sizes={TILE_SIZES}
                className="object-cover"
              />
              {withHoverImage && country.hoverImageUrl ? (
                /* The wrapper fades, not the image: a remote photo draws its own loading layer
                   above itself, and left visible that layer would cover the first photo. */
                <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Image
                    src={country.hoverImageUrl}
                    alt=""
                    fill
                    sizes={TILE_SIZES}
                    className="object-cover"
                  />
                </div>
              ) : null}
            </>
          ) : undefined
        }
        title={country.label}
        subtitle={
          price != null && price > 0
            ? t("perPersonWeek", { price: money(price, country.currency ?? undefined) })
            : t("yachtCount", { count: country.count ?? 0 })
        }
        className="w-full transition-transform duration-200 group-hover:-translate-y-1"
      />
    </Link>
  );
}

/*
 * The slides are the only facet-dependent part. Isolated so `useQuery`'s clock read stays out of
 * the prerendered shell -- heading, arrows and the CTA paint immediately. With no facets this
 * renders no slides, which is exactly what the carousel showed while the query was pending.
 */
function DestinationSlides() {
  const countries = useFeaturedCountries().slice(0, SLIDER_COUNT);

  return (
    <>
      {countries.map((country) => (
        <CarouselSlide
          key={country.value}
          className="basis-[85%] pr-5 sm:basis-1/2 md:basis-105 lg:basis-1/3 xl:basis-105"
        >
          <DestinationTile country={country} withHoverImage />
        </CarouselSlide>
      ))}
    </>
  );
}

function DestinationGrid() {
  const countries = useFeaturedCountries().slice(0, GRID_COUNT);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {countries.map((country) => (
        <DestinationTile key={country.value} country={country} />
      ))}
    </div>
  );
}

export default function PopularDestinations() {
  const t = useTranslations("Home.PopularDestinations");
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
      <div className="mx-auto max-w-384 pt-10 pb-8 md:pt-17.5 md:pb-12.5 xl:pt-25 xl:pb-15">
        {expanded ? (
          <div className="flex flex-col gap-8 xl:gap-10">
            <div className="px-4 md:px-13.5 xl:px-17.5">{heading}</div>
            <div className="px-4 md:px-13.5 xl:px-17.5">
              <Suspense fallback={null}>
                <DestinationGrid />
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
                <DestinationSlides />
              </Suspense>
            </CarouselViewport>

            {toggle}
          </Carousel>
        )}
      </div>
    </section>
  );
}
