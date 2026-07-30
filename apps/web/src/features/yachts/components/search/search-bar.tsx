"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Calendar, type DateRange } from "@yacht-charter/ui/components/form/calendar";
import { FieldClear } from "@yacht-charter/ui/components/form/field-clear";
import { MultiSelect } from "@yacht-charter/ui/components/form/multi-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Calendar as CalendarIcon, MapPin, Sailboat, Search } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

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

const fieldTrigger =
  "group flex h-12 w-full min-w-[200px] items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:border-foreground";

export type SearchBarProps = {
  value: FiltersState;
  onSearch: (next: FiltersState) => void;
};

export default function SearchBar({ value, onSearch }: SearchBarProps) {
  const t = useTranslations("Yachts.searchBar");
  const format = useFormatter();
  const locale = useLocale();
  const [draft, setDraft] = useDraft(value);
  const options = useFilterOptions();

  const day = (date: Date) => format.dateTime(date, "day");
  const formatRange = (range: DateRange) =>
    range.from && range.to
      ? `${day(range.from)} – ${day(range.to)}`
      : range.from
        ? day(range.from)
        : null;
  const [pending, setPending] = useState<DateRange | null>(null);

  const range = pending ?? toRange(draft);
  const rangeLabel = formatRange(range);

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

      <div className="relative">
        <Popover>
          <PopoverTrigger className={fieldTrigger}>
            <CalendarIcon className="size-6 shrink-0 text-foreground" />
            <span
              className={cn(
                "truncate",
                rangeLabel ? "text-foreground" : "text-natural-300",
                rangeLabel && "pr-6",
              )}
            >
              {rangeLabel ?? t("addDates")}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-(--anchor-width) border-0 bg-transparent p-0 shadow-none">
            <Calendar
              className="w-full"
              mode="range"
              locale={locale}
              selected={range}
              onSelect={handleRange}
            />
          </PopoverContent>
        </Popover>

        {rangeLabel ? (
          <FieldClear
            label={t("clearDates")}
            className="right-3"
            onClear={() => handleRange(undefined)}
          />
        ) : null}
      </div>

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
