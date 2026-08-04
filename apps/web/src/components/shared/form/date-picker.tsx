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

type CommonProps = {
  placeholder: string;
  /** Shows a clear control once a day is picked; omit to leave the field uncleanable. */
  clearLabel?: string;
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
  className,
  triggerClassName,
  contentClassName,
  ...props
}: DatePickerProps) {
  const format = useFormatter();
  const locale = useLocale();

  const day = (date: Date) => format.dateTime(dayToDisplay(dayFromNative(date)), "day");

  const label =
    props.mode === "range"
      ? props.value?.from
        ? props.value.to
          ? `${day(props.value.from)} – ${day(props.value.to)}`
          : day(props.value.from)
        : null
      : props.value
        ? day(props.value)
        : null;

  function clear() {
    if (props.mode === "range") props.onValueChange(undefined);
    else props.onValueChange(undefined);
  }

  return (
    <div className={cn("relative", className)}>
      <Popover>
        <PopoverTrigger className={cn(TRIGGER, triggerClassName)}>
          <CalendarIcon className="size-6 shrink-0 text-foreground" />
          <span
            className={cn("truncate", !label && "text-natural-300", label && clearLabel && "pr-6")}
          >
            {label ?? placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "w-(--anchor-width) border-0 bg-transparent p-0 shadow-none",
            contentClassName,
          )}
        >
          {props.mode === "range" ? (
            <Calendar
              className="w-full"
              mode="range"
              locale={locale}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          ) : (
            <Calendar
              className="w-full"
              locale={locale}
              selected={props.value}
              onSelect={props.onValueChange}
            />
          )}
        </PopoverContent>
      </Popover>

      {label && clearLabel ? (
        <FieldClear label={clearLabel} className="right-3" onClear={clear} />
      ) : null}
    </div>
  );
}
