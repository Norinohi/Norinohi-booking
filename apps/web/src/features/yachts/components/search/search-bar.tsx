"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { type DateRange } from "@yacht-charter/ui/components/form/calendar";
import { MultiSelect } from "@yacht-charter/ui/components/form/multi-select";
import { Sailboat, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import DatePicker from "@/components/shared/form/date-picker";
import {
  type FilterOptions,
  type FiltersState,
  labelOf,
  orderedValues,
  useDraft,
  useFilterOptions,
} from "@/components/shared/form/filters";
import { addDays, dayFromNative, dayToNative, daysBetween } from "@/lib/date";
import { slugToLabel } from "@/lib/slug-to-label";

import type { Suggestion } from "../../api/queries";
import LocationSearch from "./location-search";

function toRange(value: FiltersState): DateRange {
  if (!value.startDate) return { from: undefined, to: undefined };
  const from = dayToNative(value.startDate);
  /* A length nobody named has no end to draw; the field shows the one day instead of a band. */
  if (value.duration === "any") return { from, to: undefined };
  return { from, to: dayToNative(addDays(value.startDate, Number(value.duration))) };
}

/**
 * What the Location field shows: the destination the filters already hold, wherever it came from.
 *
 * The home page's "Where to?" writes `country`, a catalog path pins a country and a region, and
 * the panel below writes all four. The field used to render `query` alone, so a visitor who
 * picked Croatia on the home page landed on a search whose top bar looked empty and read as if
 * the choice had been dropped -- while the panel two blocks down showed it.
 *
 * Broad to specific, joined like every other multi-value trigger in the app. `query` stays as the
 * fallback so an older link that carries free text still shows something.
 */
function destinationLabel(value: FiltersState, options: FilterOptions): string {
  const labels = [
    ...value.country.map((item) => labelOf(options.countries, item)),
    ...value.sailingArea.map((item) => labelOf(options.sailingAreas, item)),
    /* No option list of its own: a city arrives locked from a catalog path, never from a control. */
    ...value.city.map(slugToLabel),
    ...value.marina.map((item) => labelOf(options.marinas, item)),
  ];

  return labels.length > 0 ? labels.join(", ") : value.query;
}

/**
 * Files a picked destination under the filter its kind belongs to, so the field and the panel hold
 * one selection rather than two spellings of it — the suggestion carries the same `value` the
 * matching facet option does.
 *
 * The other three are cleared: this is one field naming one place, and leaving a previous country
 * standing under a newly picked marina would search for boats in neither. `query` goes with them,
 * since a structured key says the same thing exactly rather than by text match.
 */
function withDestination(current: FiltersState, next: Suggestion | null): FiltersState {
  const cleared: FiltersState = {
    ...current,
    country: [],
    sailingArea: [],
    city: [],
    marina: [],
    query: "",
  };

  if (!next) return cleared;

  switch (next.kind) {
    case "country":
      return { ...cleared, country: [next.value] };
    case "region":
      return { ...cleared, sailingArea: [next.value] };
    case "location":
      return { ...cleared, city: [next.value] };
    case "base":
      return { ...cleared, marina: [next.value] };
  }
}

export type SearchBarProps = {
  value: FiltersState;
  onSearch: (next: FiltersState) => void;
};

export default function SearchBar({ value, onSearch }: SearchBarProps) {
  const t = useTranslations("Yachts.searchBar");
  const [draft, setDraft] = useDraft(value);
  const { options } = useFilterOptions();
  const [pending, setPending] = useState<DateRange | null>(null);

  const range = pending ?? toRange(draft);

  function handleRange(next: DateRange | undefined) {
    const from = next?.from;
    const to = next?.to;

    if (!from) {
      setPending(null);
      setDraft((current) => ({ ...current, startDate: null }));
      return;
    }

    if (!to) {
      setPending({ from, to: undefined });
      return;
    }

    setPending(null);
    setDraft((current) => ({
      ...current,
      startDate: dayFromNative(from),
      duration: String(daysBetween(from, to)),
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid w-full max-w-349 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_248px] xl:gap-5"
    >
      <div>
        <LocationSearch
          value={destinationLabel(draft, options)}
          onSelect={(next) => setDraft((current) => withDestination(current, next))}
          placeholder={t("location")}
        />
      </div>

      <DatePicker
        mode="range"
        value={range}
        onValueChange={handleRange}
        placeholder={t("addDates")}
        clearLabel={t("clearDates")}
        triggerClassName="min-w-50"
      />

      <div className="md:col-span-2 xl:col-span-1">
        <MultiSelect
          options={options.boatTypes}
          value={draft.boatType}
          onValueChange={(next) =>
            setDraft((current) => ({
              ...current,
              boatType: orderedValues(options.boatTypes, next),
            }))
          }
          placeholder={t("anyBoat")}
          icon={<Sailboat className="size-6 shrink-0 text-foreground" />}
        />
      </div>

      <Button
        type="submit"
        variant="brand"
        size="md"
        className="w-full md:col-span-2 xl:col-span-1"
      >
        <Search />
        {t("search")}
      </Button>
    </form>
  );
}
