"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

/*
 * Calendar — Figma "Calendar" (node 755-23072).
 * Two selection modes matching the design symbols:
 *   single ("Single Day Select") — one day, fully-rounded brand cell.
 *   range  ("Multiple Day Select") — brand start/end + natural-50 middle bar.
 * Tokens: card bg/border, brand blue (#2f80ed) selection, 36px day cells (size-9),
 * 4px cell radius (rounded-sm), 8px card radius (rounded-lg). Manrope via font-sans.
 * Self-contained (native Date, no date lib), controlled or uncontrolled.
 */

export type DateRange = { from: Date | undefined; to: Date | undefined };

type CalendarCommonProps = {
  className?: string;
  /** First column of the week: 0 = Sunday (default, per design) … 6 = Saturday. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Displayed month (controlled). Pass with `onMonthChange`. */
  month?: Date;
  /** Initial displayed month when uncontrolled. */
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  /** Return true to render a day as non-selectable. */
  disabled?: (date: Date) => boolean;
};

type SingleModeProps = {
  mode?: "single";
  /** Selected day (controlled). */
  selected?: Date;
  /** Initial selected day when uncontrolled. */
  defaultSelected?: Date;
  onSelect?: (date: Date | undefined) => void;
};

type RangeModeProps = {
  mode: "range";
  /** Selected range (controlled). */
  selected?: DateRange;
  /** Initial selected range when uncontrolled. */
  defaultSelected?: DateRange;
  onSelect?: (range: DateRange | undefined) => void;
};

export type CalendarProps = CalendarCommonProps & (SingleModeProps | RangeModeProps);

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Full weeks (7 dates each) covering `month`, including leading/trailing outside days. */
function buildWeeks(month: Date, weekStartsOn: number): Date[][] {
  const first = startOfMonth(month);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(first, -lead);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: Date[][] = [];
  for (let i = 0; i < cells; i += 7) {
    weeks.push(Array.from({ length: 7 }, (_, j) => addDays(gridStart, i + j)));
  }
  return weeks;
}

function weekdayLabels(weekStartsOn: number): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStartsOn + i) % 7]!);
}

/** Inclusive, order-normalised range endpoints (handles reversed input), or undefined. */
function rangeEndpoints(
  from: Date | undefined,
  to: Date | undefined,
): { start: Date; end: Date } | undefined {
  if (from && to) {
    return from.getTime() <= to.getTime() ? { start: from, end: to } : { start: to, end: from };
  }
  if (from) return { start: from, end: from };
  return undefined;
}

const dayBase =
  "relative flex size-9 grow cursor-pointer items-center justify-center text-center text-sm outline-none transition-colors select-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";
const dayBrand = "bg-brand font-semibold leading-[1.15] text-brand-foreground hover:bg-brand-hover";

function dayClassName(state: {
  outside: boolean;
  single: boolean;
  start: boolean;
  middle: boolean;
  end: boolean;
}): string {
  if (state.single || (state.start && state.end)) return cn(dayBase, dayBrand, "rounded-sm");
  if (state.start) return cn(dayBase, dayBrand, "rounded-l-sm");
  if (state.end) return cn(dayBase, dayBrand, "rounded-r-sm");
  if (state.middle)
    return cn(
      dayBase,
      "bg-natural-50 font-semibold leading-[1.15] text-foreground hover:bg-natural-100",
    );
  if (state.outside)
    return cn(
      dayBase,
      "rounded-sm font-medium leading-[1.3] text-natural-300 opacity-50 hover:bg-natural-50 hover:opacity-100",
    );
  return cn(dayBase, "rounded-sm font-medium leading-[1.3] text-natural-600 hover:bg-natural-50");
}

function Calendar(props: CalendarProps) {
  const { className, weekStartsOn = 0, disabled } = props;
  const isRange = props.mode === "range";

  const anchor = isRange
    ? (props.selected?.from ?? props.defaultSelected?.from)
    : (props.selected ?? props.defaultSelected);

  const [monthState, setMonthState] = React.useState<Date>(() =>
    startOfMonth(props.month ?? props.defaultMonth ?? anchor ?? new Date()),
  );
  const month = props.month ? startOfMonth(props.month) : monthState;

  const changeMonth = (next: Date) => {
    const normalized = startOfMonth(next);
    if (props.month === undefined) setMonthState(normalized);
    props.onMonthChange?.(normalized);
  };

  const [selectedState, setSelectedState] = React.useState<Date | DateRange | undefined>(
    () => props.defaultSelected,
  );
  const selected = props.selected !== undefined ? props.selected : selectedState;

  // Day under the cursor while picking the 2nd range endpoint (range mode only).
  const [hovered, setHovered] = React.useState<Date | undefined>(undefined);

  const commit = (next: Date | DateRange | undefined) => {
    if (props.selected === undefined) setSelectedState(next);
    if (props.mode === "range") props.onSelect?.(next as DateRange | undefined);
    else props.onSelect?.(next as Date | undefined);
  };

  const handleSelect = (date: Date) => {
    const day = startOfDay(date);
    if (props.mode === "range") {
      setHovered(day); // anchor the preview to the click so no stale range flashes
      const current = selected as DateRange | undefined;
      const from = current?.from;
      const to = current?.to;
      const next: DateRange =
        !from || (from && to)
          ? { from: day, to: undefined }
          : day.getTime() < from.getTime()
            ? { from: day, to: from }
            : { from, to: day };
      commit(next);
    } else {
      commit(day);
    }
    if (!isSameMonth(day, month)) changeMonth(day);
  };

  // Committed selection endpoints — drive aria + the persisted highlight.
  const singleSelected = !isRange && selected instanceof Date ? selected : undefined;
  const rangeValue = isRange ? (selected as DateRange | undefined) : undefined;
  const committed = rangeEndpoints(rangeValue?.from, rangeValue?.to);
  // Between the 1st and 2nd click, extend the highlight to the hovered day as a preview.
  const pendingSecondPick = isRange && !!rangeValue?.from && !rangeValue?.to;
  const previewing = pendingSecondPick && !!hovered;
  const display = previewing ? rangeEndpoints(rangeValue?.from, hovered) : committed;

  const weeks = React.useMemo(() => buildWeeks(month, weekStartsOn), [month, weekStartsOn]);
  const labels = React.useMemo(() => weekdayLabels(weekStartsOn), [weekStartsOn]);
  const today = startOfDay(new Date());
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(month);
  const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

  return (
    <div
      data-slot="calendar"
      className={cn(
        "flex w-fit flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-[4px_4px_10px_rgba(0,0,0,0.1)]",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground transition-colors outline-none hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 text-center text-sm font-semibold leading-[1.2] tracking-[0.02em] text-foreground capitalize">
          {monthLabel}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => changeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-foreground transition-colors outline-none hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex" role="row">
          {labels.map((label, i) => (
            <div
              key={i}
              role="columnheader"
              aria-label={label}
              className="flex h-[21px] w-9 grow items-center justify-center text-sm font-medium leading-[1.3] text-natural-300"
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="flex flex-col gap-1.5"
          role="grid"
          onMouseLeave={pendingSecondPick ? () => setHovered(undefined) : undefined}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="flex" role="row">
              {week.map((date) => {
                const key = startOfDay(date).getTime();
                const outside = !isSameMonth(date, month);
                const single = !!singleSelected && isSameDay(date, singleSelected);

                // Shape (start/middle/end) follows the display range (incl. hover preview).
                const dStart = display ? startOfDay(display.start).getTime() : undefined;
                const dEnd = display ? startOfDay(display.end).getTime() : undefined;
                const start = dStart !== undefined && key === dStart;
                const end = dEnd !== undefined && key === dEnd;
                const middle =
                  dStart !== undefined && dEnd !== undefined && key > dStart && key < dEnd;

                // aria-pressed reflects the committed selection only, never the preview.
                const cStart = committed ? startOfDay(committed.start).getTime() : undefined;
                const cEnd = committed ? startOfDay(committed.end).getTime() : undefined;
                const pressed =
                  single ||
                  (cStart !== undefined && cEnd !== undefined && key >= cStart && key <= cEnd);

                const isDisabled = disabled?.(date) ?? false;
                const isToday = isSameDay(date, today);

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    aria-label={dayFormatter.format(date)}
                    aria-pressed={pressed}
                    aria-current={isToday ? "date" : undefined}
                    data-outside={outside || undefined}
                    data-today={isToday || undefined}
                    onClick={() => handleSelect(date)}
                    onMouseEnter={
                      pendingSecondPick ? () => setHovered(startOfDay(date)) : undefined
                    }
                    className={dayClassName({ outside, single, start, middle, end })}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { Calendar };
