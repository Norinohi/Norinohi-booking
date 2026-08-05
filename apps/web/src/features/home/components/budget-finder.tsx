"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Select } from "@yacht-charter/ui/components/form/select";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

/* Option keys double as the Select's stable `value`, so a language change never rewrites state. */
const SELECTS = [
  {
    key: "budget",
    defaultValue: "budget300To600",
    options: ["budget0To300", "budget300To600", "budget600To1000", "budget1000Plus"],
  },
  {
    key: "people",
    defaultValue: "people2To4",
    options: ["people1To2", "people2To4", "people4To6", "people6To8", "people8Plus"],
  },
  {
    key: "skipper",
    defaultValue: "skipperYes",
    options: ["skipperYes", "skipperNo", "skipperOptional"],
  },
  {
    key: "destinations",
    defaultValue: "destinationsAll",
    options: [
      "destinationsAll",
      "destinationsCroatia",
      "destinationsGreece",
      "destinationsItaly",
      "destinationsTurkey",
      "destinationsCaribbean",
    ],
  },
] as const;

export default function BudgetFinder() {
  const t = useTranslations("Home.BudgetFinder");

  return (
    <section className="w-full">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex max-w-384 flex-col gap-8 px-4 pt-10 pb-8 md:px-13.5 md:pt-17.5 md:pb-12 xl:gap-10 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        <motion.h2 variants={RISE} className="text-h2 text-center text-foreground">
          {t("heading")}
        </motion.h2>

        <div className="flex flex-col gap-8 xl:gap-6">
          <motion.div
            variants={RISE}
            className="grid grid-cols-1 gap-x-5 gap-y-3 rounded-3xl border border-brand-100 bg-brand-50 p-4 md:grid-cols-2 md:gap-y-4 md:px-6 md:pt-6 md:pb-7.5 xl:grid-cols-4"
          >
            {SELECTS.map((select) => (
              <div key={select.key} className="flex flex-col gap-1.5">
                <span className="text-sm leading-[1.2] font-semibold text-natural-700">
                  {t(`labels.${select.key}`)}
                </span>
                <Select
                  className="h-12 bg-card"
                  defaultValue={select.defaultValue}
                  options={select.options.map((option) => ({
                    value: option,
                    label: t(`options.${option}`),
                  }))}
                />
              </div>
            ))}
          </motion.div>

          <motion.div variants={RISE} className="flex justify-center">
            <Button
              variant="brand"
              size="md"
              className="w-full md:w-auto"
              nativeButton={false}
              render={<Link href="/yachts" />}
            >
              {t("viewResults")}
              <ArrowUpRight />
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
