"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Calendar, type DateRange } from "@yacht-charter/ui/components/form/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { Calendar as CalendarIcon, MapPin, Sailboat, Search } from "lucide-react";
import { type FormEvent, useState } from "react";

const LOCATIONS = [
  "Croatia",
  "Greece",
  "Italy",
  "Spain",
  "France",
  "Turkey",
  "Montenegro",
] as const;

const BOATS = [
  { value: "any", label: "Any boat" },
  { value: "sailboat", label: "Sailboat" },
  { value: "catamaran", label: "Catamaran" },
  { value: "motor-yacht", label: "Motor yacht" },
  { value: "gulet", label: "Gulet" },
] as const;

// value → label map so Select renders the label ("Any boat") rather than the raw value ("any").
const BOAT_LABELS: Record<string, string> = Object.fromEntries(
  BOATS.map(({ value, label }) => [value, label]),
);

// Trigger shell shared by the date field so it reads identically to SelectTrigger.
const fieldTrigger =
  "group flex h-12 w-full min-w-[200px] items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[popup-open]:border-foreground";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatRange(range: DateRange): string | null {
  if (range.from && range.to) return `${dateFmt.format(range.from)} – ${dateFmt.format(range.to)}`;
  if (range.from) return dateFmt.format(range.from);
  return null;
}

export default function SearchBar() {
  const [location, setLocation] = useState("");
  const [boat, setBoat] = useState("any");
  const [range, setRange] = useState<DateRange>({ from: undefined, to: undefined });

  const rangeLabel = formatRange(range);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // TODO: filters are local state while there is no backend. Once the search
    // endpoint exists, lift them to the URL (nuqs) and drive the query from there.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-5 max-w-349 mx-auto w-full"
    >
      {/* Location */}
      <div className="flex-1">
        <Select value={location || null} onValueChange={(value) => setLocation(value ?? "")}>
          <SelectTrigger className="h-12 w-full">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <MapPin className="size-6 shrink-0 text-foreground" />
              <SelectValue placeholder="Location" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="flex-1">
        <Popover>
          <PopoverTrigger className={fieldTrigger}>
            <CalendarIcon className="size-6 shrink-0 text-foreground" />
            <span className={rangeLabel ? "truncate text-foreground" : "truncate text-natural-300"}>
              {rangeLabel ?? "Add dates"}
            </span>
          </PopoverTrigger>
          {/* Match the trigger's width so the calendar lines up with the field above it. */}
          <PopoverContent className="w-(--anchor-width) border-0 bg-transparent p-0 shadow-none">
            <Calendar
              className="w-full"
              mode="range"
              selected={range}
              onSelect={(next) => setRange(next ?? { from: undefined, to: undefined })}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Boat type */}
      <div className="flex-1">
        <Select value={boat} onValueChange={(value) => setBoat(value ?? "any")}>
          <SelectTrigger className="h-12 w-full">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Sailboat className="size-6 shrink-0 text-foreground" />
              <SelectValue placeholder="Any boat">
                {(value) => BOAT_LABELS[value as string] ?? "Any boat"}
              </SelectValue>
            </span>
          </SelectTrigger>
          <SelectContent>
            {BOATS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Submit */}
      <Button type="submit" variant="brand" size="md" className="w-full md:w-[248px]">
        <Search />
        Search
      </Button>
    </form>
  );
}
