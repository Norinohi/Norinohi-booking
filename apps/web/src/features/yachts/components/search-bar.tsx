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
import { type FormEvent, useState } from "react";

import {
  BOAT_TYPES,
  COUNTRIES,
  type FiltersState,
  orderedValues,
  useDraft,
} from "@/components/shared/filters";
import { addDays, dayFromNative, dayToNative, daysBetween, formatDay } from "@/lib/date";

function toRange(value: FiltersState): DateRange {
  if (!value.startDate) return { from: undefined, to: undefined };
  return {
    from: dayToNative(value.startDate),
    to: dayToNative(addDays(value.startDate, Number(value.duration))),
  };
}

const fieldTrigger =
  "group flex h-12 w-full min-w-[200px] items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:border-foreground";

function formatRange(range: DateRange): string | null {
  if (range.from && range.to) {
    return `${formatDay(dayFromNative(range.from))} – ${formatDay(dayFromNative(range.to))}`;
  }
  if (range.from) return formatDay(dayFromNative(range.from));
  return null;
}

export type SearchBarProps = {
  value: FiltersState;
  onSearch: (next: FiltersState) => void;
};

export default function SearchBar({ value, onSearch }: SearchBarProps) {
  const [draft, setDraft] = useDraft(value);
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
      {/* Location */}
      <div>
        <MultiSelect
          options={COUNTRIES}
          value={draft.country}
          onValueChange={(next) =>
            setDraft((current) => ({ ...current, country: orderedValues(COUNTRIES, next) }))
          }
          placeholder="Location"
          searchPlaceholder="Search Countries..."
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
        />
      </div>

      {/* Date range */}
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
              {rangeLabel ?? "Add dates"}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-(--anchor-width) border-0 bg-transparent p-0 shadow-none">
            <Calendar className="w-full" mode="range" selected={range} onSelect={handleRange} />
          </PopoverContent>
        </Popover>

        {rangeLabel ? (
          <FieldClear
            label="Clear dates"
            className="right-3"
            onClear={() => handleRange(undefined)}
          />
        ) : null}
      </div>

      {/* Boat type */}
      <div className="md:col-span-2 xl:col-span-1">
        <MultiSelect
          options={BOAT_TYPES}
          value={draft.boatType}
          onValueChange={(next) =>
            setDraft((current) => ({ ...current, boatType: orderedValues(BOAT_TYPES, next) }))
          }
          placeholder="Any boat"
          icon={<Sailboat className="size-6 shrink-0 text-foreground" />}
        />
      </div>

      {/* Submit */}
      <Button
        type="submit"
        variant="brand"
        size="md"
        className="w-full md:col-span-2 xl:col-span-1"
      >
        <Search />
        Search
      </Button>
    </form>
  );
}
