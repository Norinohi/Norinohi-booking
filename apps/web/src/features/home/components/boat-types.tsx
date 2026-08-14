"use client";

import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";

import { useFilterOptions, useFilterRanges } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

/*
 * The luxury card is editorial, not a facet: no provider category means "luxury", and the
 * ones that sound like it ("Luxury sailing yacht") are folded into their base type by the
 * canonical grouping in packages/providers. Length is the stand-in, so the card links to a
 * size filter rather than a boat type.
 *
 * Feet, because that is the unit `filterParsers.length` carries — see `toSearchInput`.
 */
const LUXURY_MIN_FEET = Math.round(15 / 0.3048);

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
    <motion.div variants={RISE}>
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
    </motion.div>
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
