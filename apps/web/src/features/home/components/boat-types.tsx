"use client";

import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { buildSearchHref } from "@/features/yachts";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

/* `type` is the boatType facet code — it becomes the sole filter on the /yachts redirect. */
const BOAT_TYPES = [
  { key: "catamaran", type: "catamaran", image: "/assets/home/boat-types/catamaran.webp" },
  {
    key: "sailingYacht",
    type: "sailing-yacht",
    image: "/assets/home/boat-types/sailing-yacht.webp",
  },
  { key: "motorYacht", type: "motor-yacht", image: "/assets/home/boat-types/motor-yacht.webp" },
  { key: "luxuryYacht", type: "luxury-yacht", image: "/assets/home/boat-types/luxury-yacht.webp" },
] as const;

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
          {BOAT_TYPES.map((boat) => (
            <motion.div key={boat.key} variants={RISE}>
              <Link
                href={buildSearchHref({ boatType: [boat.type] })}
                className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <BoatCard
                  image={boat.image}
                  imageAlt={t(`items.${boat.key}.imageAlt`)}
                  title={t(`items.${boat.key}.title`)}
                  description={t(`items.${boat.key}.description`)}
                  className="w-full transition-transform duration-200 group-hover:-translate-y-1"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
