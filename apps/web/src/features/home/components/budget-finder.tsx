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
/** A target, not a count: the step rounds up from here, so the list comes back this long or shorter. */
const BUDGET_BUCKETS = 5;

/**
 * The nearest round step at or above `raw` — 1, 2 or 5 times a power of ten.
 *
 * Dividing the catalog's span by a bucket count lands on figures like 3,964, and a menu of
 * "€180 – €4,144" reads as a machine's arithmetic rather than a price the reader chose.
 */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return factor * magnitude;
}

/* Skipper Yes → crewed variants, No → bareboat — crew facet codes are bareboat | skipper | full-crew. */
const CREWED = ["skipper", "full-crew"];
const BAREBOAT = ["bareboat"];

type Facets = ReturnType<typeof useFilterOptions>["data"];

type BudgetBucket = { value: string; label: string; price: [number, number] };

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
    if (max <= min) return [];

    /* Edges on a round step, so the list reads €5,000 rather than the catalog's €4,144. */
    const step = niceStep((max - min) / BUDGET_BUCKETS);
    const edges: number[] = [];
    /* Strictly above `min`, or a catalog whose floor already sits on the step opens with an
       empty "Up to €500" bucket that matches the single cheapest boat and nothing else. */
    for (let edge = Math.floor(min / step) * step + step; edge < max; edge += step) {
      edges.push(edge);
    }

    const lows = [min, ...edges];
    const highs = [...edges, max];
    return lows.map((lo, index): BudgetBucket => {
      const isLast = index === lows.length - 1;
      const hi = highs[index] ?? max;
      /*
       * The ends are named, not bounded: the first bucket starts at whatever the cheapest boat
       * costs, which nobody needs to read, and the last runs to the catalog's ceiling the way
       * the price slider does — printing that ceiling as a closing figure promised there was
       * nothing above it.
       */
      const label = isLast
        ? t("options.budgetFrom", { from: money(lo * 100, range.currency) })
        : index === 0
          ? t("options.budgetUpTo", { to: money(hi * 100, range.currency) })
          : `${money(lo * 100, range.currency)} – ${money(hi * 100, range.currency)}`;

      return { value: `${lo}-${hi}`, label, price: [lo, hi] };
    });
  }, [data?.priceRange, money, t]);

  const berthsRange = data?.ranges.berths;

  const budgetOptions = [
    { value: ANY, label: t("options.any") },
    ...budgetBuckets.map(({ value, label }) => ({ value, label })),
  ];
  /* From one, never from the catalog's floor: `berths.min` is 0 on listings the provider left
     unfilled, and a charter for nobody is not a choice the reader can make. */
  const peopleFrom = Math.max(1, berthsRange?.min ?? 1);
  const peopleOptions = [
    { value: ANY, label: t("options.any") },
    ...Array.from(
      { length: berthsRange ? Math.max(0, berthsRange.max - peopleFrom + 1) : 0 },
      (_, index) => {
        const count = String(peopleFrom + index);
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
