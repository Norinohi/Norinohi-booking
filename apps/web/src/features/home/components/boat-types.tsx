"use client";

import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import {
  Carousel,
  CarouselNav,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";

import { useFilterOptions, useFilterRanges } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { RISE, VIEWPORT } from "@/lib/motion";

/*
 * The luxury card is editorial, not a facet: no provider category means "luxury", and the
 * ones that sound like it ("Luxury sailing yacht") are folded into their base type by the
 * canonical grouping in packages/providers. Length is the stand-in, so the card links to a
 * size filter rather than a boat type.
 *
 * Feet, because that is the unit `filterParsers.length` carries — see `toSearchInput`.
 */
const LUXURY_MIN_FEET = Math.round(15 / 0.3048);

/* Four across at the widest, with the next one peeking past the edge as the cue that it scrolls. */
const SLIDE = "basis-[85%] pr-5 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4";

/*
 * The only part of this section that reads facets. Isolated so `useQuery`'s clock read stays out
 * of the prerendered shell, which lets the heading and section chrome above it paint immediately.
 *
 * Before facets arrive this renders nothing — exactly what the section rendered previously while
 * the query was pending — so the boundary's fallback is `null` rather than an invented skeleton
 * that would duplicate the grid's structure and drift as the cards change.
 */
function BoatTypeCard({
  href,
  image,
  imageAlt,
  title,
  description,
}: {
  href: ReturnType<typeof buildSearchHref>;
  image?: string;
  imageAlt: string;
  title: string;
  description?: string | null;
}) {
  return (
    <CarouselSlide className={SLIDE}>
      <Link
        href={href}
        className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <BoatCard
          image={image}
          imageAlt={imageAlt}
          title={title}
          description={description}
          className="w-full transition-transform duration-200 group-hover:-translate-y-1"
        />
      </Link>
    </CarouselSlide>
  );
}

function BoatTypeCards() {
  const t = useTranslations("Home.BoatTypes.luxury");
  const { options } = useFilterOptions();
  const { ranges } = useFilterRanges();

  const maxLengthFeet = ranges.length[1];

  return (
    <>
      {options.boatTypes.map((boatType) => (
        <BoatTypeCard
          key={boatType.value}
          href={buildSearchHref({ boatType: [boatType.value] })}
          image={boatType.imageUrl ?? undefined}
          imageAlt={boatType.label}
          title={boatType.label}
          description={boatType.description}
        />
      ))}

      {/*
       * Held back until the fleet's own maximum has arrived: the upper bound comes from the
       * facets, and linking with a zero max before then would send the visitor to a filter
       * that matches nothing.
       */}
      {maxLengthFeet > LUXURY_MIN_FEET && (
        <BoatTypeCard
          href={buildSearchHref({ length: [LUXURY_MIN_FEET, maxLengthFeet] })}
          image="/assets/home/boat-types/luxury-yacht.webp"
          imageAlt={t("imageAlt")}
          title={t("title")}
          description={t("description")}
        />
      )}
    </>
  );
}

export default function BoatTypes() {
  const t = useTranslations("Home.BoatTypes");

  return (
    <section className="w-full">
      <div className="mx-auto max-w-384 pt-10 pb-8 md:pt-17.5 md:pb-12.25 xl:pt-25 xl:pb-15">
        <Carousel options={{ align: "start" }} className="flex flex-col gap-8 xl:gap-10">
          {/*
           * Three columns so the heading stays centred as the design has it, with the arrows in
           * the matching column on the right. On a phone the heading needs the full width, so it
           * takes it and the arrows go — a peeking card and a swipe say the same thing there.
           */}
          <motion.div
            variants={RISE}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT}
            className="px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4 md:px-13.5 xl:px-17.5"
          >
            <h2 className="text-h2 text-center text-balance text-foreground md:col-start-2">
              {t("heading")}
            </h2>
            <CarouselNav
              previousLabel={t("previous")}
              nextLabel={t("next")}
              className="hidden md:col-start-3 md:flex md:justify-self-end"
            />
          </motion.div>

          <CarouselViewport className="pl-4 md:pl-13.5 xl:pl-17.5">
            <Suspense fallback={null}>
              <BoatTypeCards />
            </Suspense>
          </CarouselViewport>
        </Carousel>
      </div>
    </section>
  );
}
