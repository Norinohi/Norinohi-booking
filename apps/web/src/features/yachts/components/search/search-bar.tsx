"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { type DateRange } from "@yacht-charter/ui/components/form/calendar";
import { MultiSelect } from "@yacht-charter/ui/components/form/multi-select";
import { MapPin, Sailboat, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import DatePicker from "@/components/shared/date-picker";
import {
  type FiltersState,
  orderedValues,
  useDraft,
  useFilterOptions,
} from "@/components/shared/filters";
import { addDays, dayFromNative, dayToNative, daysBetween } from "@/lib/date";

function toRange(value: FiltersState): DateRange {
  if (!value.startDate) return { from: undefined, to: undefined };
  return {
    from: dayToNative(value.startDate),
    to: dayToNative(addDays(value.startDate, Number(value.duration))),
  };
}

export type SearchBarProps = {
  value: FiltersState;
  onSearch: (next: FiltersState) => void;
};

export default function SearchBar({ value, onSearch }: SearchBarProps) {
  const t = useTranslations("Yachts.searchBar");
  const [draft, setDraft] = useDraft(value);
  const options = useFilterOptions();
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
        <MultiSelect
          options={options.countries}
          value={draft.country}
          onValueChange={(next) =>
            setDraft((current) => ({ ...current, country: orderedValues(options.countries, next) }))
          }
          placeholder={t("location")}
          searchPlaceholder={t("searchCountries")}
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
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
