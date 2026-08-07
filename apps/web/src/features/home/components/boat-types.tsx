"use client";

import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useFilterOptions } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

export default function BoatTypes() {
  const t = useTranslations("Home.BoatTypes");
  const { options } = useFilterOptions();

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
          {options.boatTypes.map((boatType) => (
            <motion.div key={boatType.value} variants={RISE}>
              <Link
                href={buildSearchHref({ boatType: [boatType.value] })}
                className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <BoatCard
                  image={boatType.imageUrl ?? ""}
                  imageAlt={boatType.label}
                  title={boatType.label}
                  description={boatType.description}
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
