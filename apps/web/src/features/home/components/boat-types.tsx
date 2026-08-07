"use client";

import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";

import { useFilterOptions } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

/*
 * The only part of this section that reads facets. Isolated so `useQuery`'s clock read stays out
 * of the prerendered shell, which lets the heading and section chrome above it paint immediately.
 *
 * Before facets arrive this renders nothing — exactly what the section rendered previously while
 * the query was pending — so the boundary's fallback is `null` rather than an invented skeleton
 * that would duplicate the grid's structure and drift as the cards change.
 */
function BoatTypeCards() {
  const { options } = useFilterOptions();

  return (
    <>
      {options.boatTypes.map((boatType) => (
        <motion.div key={boatType.value} variants={RISE}>
          <Link
            href={buildSearchHref({ boatType: [boatType.value] })}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <BoatCard
              image={boatType.imageUrl ?? undefined}
              imageAlt={boatType.label}
              title={boatType.label}
              description={boatType.description}
              className="w-full transition-transform duration-200 group-hover:-translate-y-1"
            />
          </Link>
        </motion.div>
      ))}
    </>
  );
}

export default function BoatTypes() {
  const t = useTranslations("Home.BoatTypes");

  return (
    <section className="w-full">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex max-w-384 flex-col gap-8 px-4 pt-10 pb-8 md:px-13.5 md:pt-17.5 md:pb-12.25 xl:gap-10 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        <motion.h2 variants={RISE} className="text-h2 text-center text-balance text-foreground">
          {t("heading")}
        </motion.h2>

        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 sm:gap-y-8 xl:grid-cols-4">
          <Suspense fallback={null}>
            <BoatTypeCards />
          </Suspense>
        </div>
      </motion.div>
    </section>
  );
}
