"use client";

import {
  canCheckIn,
  canCheckOut,
  type CharterConstraints,
} from "@yacht-charter/api/lib/availability-rules";
import type { DateRange } from "@yacht-charter/ui/components/form/calendar";
import { useState } from "react";

import DatePicker from "@/components/shared/form/date-picker";
import { dayFromNative, dayToNative } from "@/lib/date";

export type CharterPeriod = { checkIn: string; checkOut: string };

/*
 * The date control for a charter, driven by the listing's constraints rather than by a list
 * of periods someone enumerated in advance.
 *
 * The half-picked range lives here rather than with the quote: between the two clicks there
 * is no period to price, and the predicate has to narrow to the check-outs that are legal
 * for the check-in already chosen. Only a complete, legal range reaches `onSelect`.
 */
export default function CharterDateField({
  constraints,
  value,
  onSelect,
  disabled = false,
  placeholder,
  className,
  triggerClassName,
}: {
  constraints: CharterConstraints;
  /** The committed period, normally the quote's. Resets whatever was half-picked. */
  value: CharterPeriod | undefined;
  onSelect: (period: CharterPeriod) => void;
  disabled?: boolean;
  placeholder: string;
  className?: string;
  triggerClassName?: string;
}) {
  const [pending, setPending] = useState<DateRange | undefined>(undefined);
  const [open, setOpen] = useState(false);

  /* `dayToNative`/`dayFromNative` are the Calendar's matched pair: it is native-Date only. */
  const committed: DateRange | undefined = value
    ? { from: dayToNative(value.checkIn), to: dayToNative(value.checkOut) }
    : undefined;
  /* While a check-in is chosen but its check-out is not, the pending range is the truth. */
  const range = pending?.from && !pending.to ? pending : committed;

  const checkIn = pending?.from && !pending.to ? dayFromNative(pending.from) : null;

  function isDayDisabled(date: Date): boolean {
    const day = dayFromNative(date);
    /* Keep the chosen check-in clickable so a mis-click can be redone in place. */
    if (checkIn !== null) return day !== checkIn && !canCheckOut(day, checkIn, constraints);
    return !canCheckIn(day, constraints);
  }

  function handleChange(next: DateRange | undefined) {
    setPending(next);
    if (!next?.from || !next.to) return;

    /* Both ends are in, so close: leaving the month grid up hides the price it just bought. */
    const period = { checkIn: dayFromNative(next.from), checkOut: dayFromNative(next.to) };
    setPending(undefined);
    setOpen(false);
    onSelect(period);
  }

  return (
    <DatePicker
      mode="range"
      value={range}
      onValueChange={handleChange}
      disabled={disabled ? alwaysDisabled : isDayDisabled}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      className={className}
      triggerClassName={triggerClassName}
    />
  );
}

function alwaysDisabled(): boolean {
  return true;
}
