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

const BOAT_LABELS: Record<string, string> = Object.fromEntries(
  BOATS.map(({ value, label }) => [value, label]),
);

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
    // TODO: wire to the search query once the backend exists.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid w-full max-w-349 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_248px] xl:gap-5"
    >
      {/* Location */}
      <div>
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
      <div>
        <Popover>
          <PopoverTrigger className={fieldTrigger}>
            <CalendarIcon className="size-6 shrink-0 text-foreground" />
            <span className={rangeLabel ? "truncate text-foreground" : "truncate text-natural-300"}>
              {rangeLabel ?? "Add dates"}
            </span>
          </PopoverTrigger>
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
      <div className="md:col-span-2 xl:col-span-1">
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
