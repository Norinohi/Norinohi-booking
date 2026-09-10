"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Select, type SelectOptionGroup } from "@yacht-charter/ui/components/form/select";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Suspense, useState } from "react";

import {
  EMPTY_OPTIONS,
  type FilterOptions,
  groupByPopularity,
  useFilterOptions,
} from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

const ANY = "any";
const ALL = "all";
const NOT_SURE = "not-sure";

/** Per person for a week aboard, in whole euros. A listing's search price covers one week. */
const BUDGETS = [
  { value: "300-600", min: 300, max: 600 },
  { value: "600-1000", min: 600, max: 1000 },
  { value: "1000-1500", min: 1000, max: 1500 },
  { value: "1500-2000", min: 1500, max: 2000 },
  { value: "2000-plus", min: 2000, max: null },
] as const;

/** The planner's guest counts, so both turn a per-person budget into the same yacht price. */
const GROUP_SIZES = [
  { value: "2-4", label: "2–4", guests: 4, minBerths: 4 },
  { value: "5-8", label: "5–8", guests: 8, minBerths: 8 },
  { value: "9-plus", label: "9+", guests: 10, minBerths: 9 },
] as const;
const NEUTRAL_GUESTS = 6;

/* Skipper Yes → crewed variants, No → bareboat — crew facet codes are bareboat | skipper | full-crew. */
const CREWED = ["skipper", "full-crew"];
const BAREBOAT = ["bareboat"];

type Facets = ReturnType<typeof useFilterOptions>["data"];

/** An open end runs to the catalogue's ceiling, which is what leaves the upper bound unsent. */
function priceRangeFor(
  budget: (typeof BUDGETS)[number],
  guests: number,
  ceiling: number | undefined,
): [number, number] | undefined {
  const floor = budget.min * guests;
  if (budget.max !== null) return [floor, budget.max * guests];
  return ceiling === undefined ? undefined : [floor, Math.max(floor, ceiling)];
}

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
  const tGroups = useTranslations("Filters.groups");
  const money = useMoney();

  const [budget, setBudget] = useState<string | null>(null);
  const [people, setPeople] = useState<string | null>(null);
  const [skipper, setSkipper] = useState(ANY);
  const [destination, setDestination] = useState(ALL);

  const budgetOptions = BUDGETS.map(({ value, min, max }) => ({
    value,
    label:
      max === null
        ? t("options.budgetFrom", { from: money(min * 100, "EUR") })
        : `${money(min * 100, "EUR")} – ${money(max * 100, "EUR")}`,
  }));
  const peopleOptions = [
    ...GROUP_SIZES.map(({ value, label }) => ({ value, label })),
    { value: NOT_SURE, label: t("options.peopleNotSure") },
  ];
  const skipperOptions = [
    { value: ANY, label: t("options.any") },
    { value: "yes", label: t("options.skipperYes") },
    { value: "no", label: t("options.skipperNo") },
  ];
  const allDestinations = { value: ALL, label: t("options.destinationsAll") };
  const destinationOptions = [allDestinations, ...options.countries];
  const countryGroups = groupByPopularity(options.countries, {
    popular: tGroups("popularCountries"),
    all: tGroups("allCountries"),
  });
  const destinationGroups: SelectOptionGroup[] | undefined = countryGroups
    ? [{ key: ALL, options: [allDestinations] }, ...countryGroups]
    : undefined;

  const selectedBudget = BUDGETS.find((option) => option.value === budget);
  const selectedGroup = GROUP_SIZES.find((option) => option.value === people);
  const priceCeiling = data?.priceRange ? Math.ceil(data.priceRange.maxMinor / 100) : undefined;
  const berthsCeiling = data?.ranges.berths.max;

  const href = buildSearchHref({
    country: destination !== ALL ? [destination] : undefined,
    crew: skipper === "yes" ? CREWED : skipper === "no" ? BAREBOAT : undefined,
    price: selectedBudget
      ? priceRangeFor(selectedBudget, selectedGroup?.guests ?? NEUTRAL_GUESTS, priceCeiling)
      : undefined,
    berths:
      selectedGroup && berthsCeiling !== undefined
        ? [selectedGroup.minBerths, Math.max(selectedGroup.minBerths, berthsCeiling)]
        : undefined,
  });

  const fields: {
    key: "budget" | "people" | "skipper" | "destinations";
    options: { value: string; label: string }[];
    groups?: SelectOptionGroup[];
    value: string | null;
    placeholder?: string;
    onValueChange: (value: string) => void;
    isLoading: boolean;
  }[] = [
    {
      key: "budget",
      options: budgetOptions,
      value: budget,
      placeholder: t("options.any"),
      onValueChange: setBudget,
      isLoading: isPending,
    },
    {
      key: "people",
      options: peopleOptions,
      value: people,
      placeholder: t("options.any"),
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
      groups: destinationGroups,
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
              groups={field.groups}
              value={field.value}
              placeholder={field.placeholder}
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
