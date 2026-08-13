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

import { dayFromNative, dayToDisplay } from "@/lib/date";

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
          {props.mode === "range" ? (
            <Calendar
              className="w-full"
              mode="range"
              locale={locale}
              disabled={disabled}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          ) : (
            <Calendar
              className="w-full"
              locale={locale}
              disabled={disabled}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          )}
        </PopoverContent>
      </Popover>

      {label && clearLabel ? (
        <FieldClear label={clearLabel} className="right-3" onClear={clearDates} />
      ) : null}
    </div>
  );
}
