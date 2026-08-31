"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Select } from "@yacht-charter/ui/components/form/select";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Suspense, useMemo, useState } from "react";

import {
  EMPTY_OPTIONS,
  type FilterOptions,
  useFilterOptions,
} from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

const ANY = "any";
const ALL = "all";
const BUDGET_BUCKETS = 5;

/* Skipper Yes → crewed variants, No → bareboat — crew facet codes are bareboat | skipper | full-crew. */
const CREWED = ["skipper", "full-crew"];
const BAREBOAT = ["bareboat"];

type Facets = ReturnType<typeof useFilterOptions>["data"];

/*
 * The form, with its facet-derived inputs injected. Rendering this with no data and `isPending`
 * is the Suspense fallback, so the shell and the resolved UI are the same component — every
 * select keeps its label, height and breakpoint behaviour while the facets are still in flight,
 * and there is no separate skeleton to drift.
 */
function BudgetFinderForm({
  data,
  options,
  isPending,
}: {
  data: Facets;
  options: FilterOptions;
  isPending: boolean;
}) {
  const t = useTranslations("Home.BudgetFinder");
  const money = useMoney();

  const [budget, setBudget] = useState(ANY);
  const [people, setPeople] = useState(ANY);
  const [skipper, setSkipper] = useState(ANY);
  const [destination, setDestination] = useState(ALL);

  const budgetBuckets = useMemo(() => {
    const range = data?.priceRange;
    if (!range) return [];
    const min = Math.floor(range.minMinor / 100);
    const max = Math.ceil(range.maxMinor / 100);
    const step = (max - min) / BUDGET_BUCKETS;
    return Array.from({ length: BUDGET_BUCKETS }, (_, index) => {
      const lo = Math.round(min + index * step);
      const hi = index === BUDGET_BUCKETS - 1 ? max : Math.round(min + (index + 1) * step);
      const price: [number, number] = [lo, hi];
      return {
        value: `${lo}-${hi}`,
        label: `${money(lo * 100, range.currency)} – ${money(hi * 100, range.currency)}`,
        price,
      };
    });
  }, [data?.priceRange, money]);

  const berthsRange = data?.ranges.berths;

  const budgetOptions = [
    { value: ANY, label: t("options.any") },
    ...budgetBuckets.map(({ value, label }) => ({ value, label })),
  ];
  const peopleOptions = [
    { value: ANY, label: t("options.any") },
    ...Array.from(
      { length: berthsRange ? berthsRange.max - berthsRange.min + 1 : 0 },
      (_, index) => {
        const count = String((berthsRange?.min ?? 0) + index);
        return { value: count, label: count };
      },
    ),
  ];
  const skipperOptions = [
    { value: ANY, label: t("options.any") },
    { value: "yes", label: t("options.skipperYes") },
    { value: "no", label: t("options.skipperNo") },
  ];
  const destinationOptions = [
    { value: ALL, label: t("options.destinationsAll") },
    ...options.countries,
  ];

  const selectedBudget = budgetBuckets.find((bucket) => bucket.value === budget);
  const href = buildSearchHref({
    country: destination !== ALL ? [destination] : undefined,
    crew: skipper === "yes" ? CREWED : skipper === "no" ? BAREBOAT : undefined,
    price: selectedBudget?.price,
    berths: people !== ANY && berthsRange ? [Number(people), berthsRange.max] : undefined,
  });

  const fields: {
    key: "budget" | "people" | "skipper" | "destinations";
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (value: string) => void;
    isLoading: boolean;
  }[] = [
    {
      key: "budget",
      options: budgetOptions,
      value: budget,
      onValueChange: setBudget,
      isLoading: isPending,
    },
    {
      key: "people",
      options: peopleOptions,
      value: people,
      onValueChange: setPeople,
      isLoading: isPending,
    },
    {
      key: "skipper",
      options: skipperOptions,
      value: skipper,
      onValueChange: setSkipper,
      isLoading: false,
    },
    {
      key: "destinations",
      options: destinationOptions,
      value: destination,
      onValueChange: setDestination,
      isLoading: isPending,
    },
  ];

  return (
    <div className="flex flex-col gap-8 xl:gap-6">
      <motion.div
        variants={RISE}
        className="grid grid-cols-1 gap-x-5 gap-y-3 rounded-3xl border border-brand-100 bg-brand-50 p-4 md:grid-cols-2 md:gap-y-4 md:px-6 md:pt-6 md:pb-7.5 xl:grid-cols-4"
      >
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <span className="text-sm leading-[1.2] font-semibold text-natural-700">
              {t(`labels.${field.key}`)}
            </span>
            <Select
              className="h-12 bg-card"
              ariaLabel={t(`labels.${field.key}`)}
              options={field.options}
              value={field.value}
              onValueChange={field.onValueChange}
              isLoading={field.isLoading}
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
          render={<Link href={href} />}
        >
          {t("viewResults")}
          <ArrowUpRight />
        </Button>
      </motion.div>
    </div>
  );
}

/* Isolated so `useQuery`'s clock read stays out of the prerendered shell. */
function BudgetFinderFormLive() {
  const { data, options, isPending } = useFilterOptions();

  return <BudgetFinderForm data={data} options={options} isPending={isPending} />;
}

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

        <Suspense
          fallback={<BudgetFinderForm data={undefined} options={EMPTY_OPTIONS} isPending />}
        >
          <BudgetFinderFormLive />
        </Suspense>
      </motion.div>
    </section>
  );
}
