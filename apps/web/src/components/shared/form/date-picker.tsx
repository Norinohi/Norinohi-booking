"use client";

import { Calendar, type DateRange } from "@yacht-charter/ui/components/form/calendar";
import { FieldClear } from "@yacht-charter/ui/components/form/field-clear";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import { useFormatter, useLocale } from "next-intl";
import type { ReactNode } from "react";

import { dayFromNative, dayToDisplay, isBeforeToday } from "@/lib/date";

const TRIGGER =
  "group flex h-12 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base text-foreground transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground";

type DayFormat = "day" | "dayShort" | "dayCompact";

type CommonProps = {
  placeholder: string;
  /** Shows a clear control once a day is picked; omit to leave the field uncleanable. */
  clearLabel?: string;
  /** Lets the trigger hug and grow with its label instead of truncating it. */
  hugContent?: boolean;
  /** Greys out days the caller will not accept; re-read on every render, so it may depend on `value`. */
  disabled?: (date: Date) => boolean;
  /** Extra treatment for individual days, passed straight to the calendar. */
  dayModifier?: (date: Date) => { className?: string; label?: string } | undefined;
  /** A key to what the marked days mean, printed under the grid. */
  legend?: ReactNode;
  /*
   * Opens the past up for selection. Off by default because every picker but one is choosing a
   * charter, and a charter cannot start yesterday: left open, the home page search happily
   * accepted last week and answered "0 yachts found" as though none existed. The exception is
   * the bookings filter, which is searching a history and needs the days behind it.
   */
  allowPast?: boolean;
  /*
   * A rule printed above the month grid, for a calendar that refuses most of its own days.
   * The line under the trigger is hidden by the popup that covers it, which left the greyed
   * cells unexplained at exactly the moment somebody was clicking one.
   */
  hint?: string;
  /*
   * The month the grid opens on when nothing is picked yet. A calendar whose first sellable day
   * is four months out opened on today and showed a grid with every cell greyed, which reads as
   * a boat with no availability at all rather than as one whose season starts later.
   */
  defaultMonth?: Date;
  /** Controls the calendar popup; pair with `onOpenChange`. Omit both to leave it uncontrolled. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** `dayShort` for a narrow trigger; the default spells the month out in full. */
  dateFormat?: DayFormat;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

type SingleProps = {
  mode?: "single";
  value: Date | undefined;
  onValueChange: (next: Date | undefined) => void;
};

type RangeProps = {
  mode: "range";
  value: DateRange | undefined;
  onValueChange: (next: DateRange | undefined) => void;
};

export type DatePickerProps = CommonProps & (SingleProps | RangeProps);

export default function DatePicker({
  placeholder,
  clearLabel,
  hugContent,
  disabled,
  dayModifier,
  legend,
  allowPast = false,
  hint,
  defaultMonth,
  open,
  onOpenChange,
  dateFormat = "day",
  className,
  triggerClassName,
  contentClassName,
  ...props
}: DatePickerProps) {
  const format = useFormatter();
  const locale = useLocale();

  /* The caller's own rule still applies on top of the floor, so both can refuse a day. */
  const isDayDisabled = (date: Date) =>
    (!allowPast && isBeforeToday(date)) || (disabled?.(date) ?? false);

  const day = (date: Date, style: DayFormat = dateFormat) =>
    format.dateTime(dayToDisplay(dayFromNative(date)), style);

  /*
   * A range repeats the year on both ends, which is what overflows a narrow trigger. Where the
   * two ends share a year, the near one drops it: "10 Oct – 17 Oct 2026" says the same thing and
   * fits. Only offered on the compact format, so the wider fields keep the full date they show today.
   */
  function rangeLabel(from: Date, to: Date): string {
    const yearless = dateFormat === "dayShort" && from.getFullYear() === to.getFullYear();
    return `${day(from, yearless ? "dayCompact" : dateFormat)} – ${day(to)}`;
  }

  const label =
    props.mode === "range"
      ? props.value?.from
        ? props.value.to
          ? rangeLabel(props.value.from, props.value.to)
          : day(props.value.from)
        : null
      : props.value
        ? day(props.value)
        : null;

  function clearDates() {
    if (props.mode === "range") props.onValueChange(undefined);
    else props.onValueChange(undefined);
  }

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger className={cn(TRIGGER, triggerClassName)}>
          <CalendarIcon className="size-6 shrink-0 text-foreground" />
          <span
            className={cn(
              hugContent ? "whitespace-nowrap" : "truncate",
              !label && "text-natural-300",
              label && clearLabel && "pr-6",
            )}
          >
            {label ?? placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            // Match the trigger width, but never below the calendar's own size (7 × 36px cells +
            // padding ≈ 284px) — a narrow trigger would otherwise squash and clip the month grid.
            "w-(--anchor-width) min-w-72 border-0 bg-transparent p-0 shadow-none",
            contentClassName,
          )}
        >
          {hint ? (
            <p className="mb-2 rounded-lg bg-natural-50 px-3 py-2 text-sm leading-[1.3] text-natural-600">
              {hint}
            </p>
          ) : null}
          {props.mode === "range" ? (
            <Calendar
              className="w-full"
              mode="range"
              locale={locale}
              defaultMonth={defaultMonth}
              disabled={isDayDisabled}
              dayModifier={dayModifier}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          ) : (
            <Calendar
              className="w-full"
              locale={locale}
              defaultMonth={defaultMonth}
              disabled={isDayDisabled}
              dayModifier={dayModifier}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          )}
          {legend ? <div className="mt-2">{legend}</div> : null}
        </PopoverContent>
      </Popover>

      {label && clearLabel ? (
        <FieldClear label={clearLabel} className="right-3" onClear={clearDates} />
      ) : null}
    </div>
  );
}
