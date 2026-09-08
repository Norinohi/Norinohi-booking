"use client";

import { unexpiredRules } from "@yacht-charter/api/lib/availability-rules";
import {
  combinedCanCheckIn,
  combinedCanCheckOut,
  combinedLegalCheckOuts,
  firstCombinedCheckInDay,
  occupancyStatusOn,
  type OfferConstraints,
} from "@yacht-charter/api/lib/offer-availability";
import type { DateRange } from "@yacht-charter/ui/components/form/calendar";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import DatePicker from "@/components/shared/form/date-picker";
import { useCharterPeriodLabel } from "@/hooks/use-charter-period";
import { dayFromNative, dayToNative } from "@/lib/date";

export type CharterPeriod = { checkIn: string; checkOut: string };

/*
 * The two reasons a greyed day is worth explaining, and how each is tinted.
 *
 * Only these two: a day the operator withheld for a service week or a regatta is its own
 * business and stays plain grey. The tint sits on top of the disabled treatment rather than
 * replacing it, so a marked day still reads as unclickable.
 */
const OCCUPANCY_TINT = {
  booked: "bg-error-50 text-error-500",
  held: "bg-warning-50 text-warning-600",
} as const;

/*
 * The cell keeps its hover, so the tooltip naming the reason can actually be reached: the
 * calendar takes pointer events off every disabled day, and a tint nobody can hover over says
 * only that something is different about this date. Important because the rule it overrides is
 * a `disabled:` variant, which the cascade would otherwise apply last whatever the class order.
 * The cursor goes back to an arrow so the day still reads as unclickable, which it is.
 */
const MARKED_DAY = "pointer-events-auto! cursor-default";

/*
 * The date control for a charter, driven by what the listing's offers will sell rather than by
 * a list of periods someone enumerated in advance.
 *
 * One set of constraints per vendor, never merged: a day is offered when any offer can deliver
 * it, which is what lets a yacht both providers sell show one calendar without inventing a
 * charter neither would honour.
 *
 * The half-picked range lives here rather than with the quote: between the two clicks there
 * is no period to price, and the predicate has to narrow to the check-outs that are legal
 * for the check-in already chosen. Only a complete, legal range reaches `onSelect`.
 */
interface CharterDateFieldProps {
  offers: readonly OfferConstraints[];
  /** The committed period, normally the quote's. Resets whatever was half-picked. */
  value: CharterPeriod | undefined;
  onSelect: (period: CharterPeriod) => void;
  disabled?: boolean;
  placeholder: string;
  className?: string;
  triggerClassName?: string;
}

export default function CharterDateField({
  offers,
  value,
  onSelect,
  disabled = false,
  placeholder,
  className,
  triggerClassName,
}: CharterDateFieldProps) {
  const t = useTranslations("Common.charterPeriod");
  const [pending, setPending] = useState<DateRange | undefined>(undefined);
  const [open, setOpen] = useState(false);
  /* Read once per mount: a clock read during render would differ between server and client. */
  const [today] = useState(() => dayFromNative(new Date()));
  /*
   * Every shape on offer, so a boat two vendors sell describes both rather than one, minus the
   * ones whose season has passed: an operator that sold three-night stays last spring and whole
   * Saturday weeks since would otherwise be described as still selling both. The calendar below
   * judges each day against the rules in force on it, so this only keeps the sentence honest.
   */
  const periodLabel = useCharterPeriodLabel(
    unexpiredRules(
      offers.flatMap((offer) => offer.rules),
      today,
    ),
  );

  /* `dayToNative`/`dayFromNative` are the Calendar's matched pair: it is native-Date only. */
  const committed: DateRange | undefined = value
    ? { from: dayToNative(value.checkIn), to: dayToNative(value.checkOut) }
    : undefined;
  /* While a check-in is chosen but its check-out is not, the pending range is the truth. */
  const range = pending?.from && !pending.to ? pending : committed;

  const checkIn = pending?.from && !pending.to ? dayFromNative(pending.from) : null;

  /*
   * The month the grid opens on before anything is picked: the first charter anybody would
   * sell, not today. A boat whose season opens in January was showing December's grid with
   * every cell greyed out, which reads as "fully booked" rather than "starts later" - and the
   * visitor had to guess how many times to press the arrow. Only when nothing is selected;
   * a committed period is its own answer to which month to show.
   */
  const firstCheckIn = useMemo(() => firstCombinedCheckInDay(today, offers), [today, offers]);
  const openMonth = range ? undefined : firstCheckIn;

  function isDayDisabled(date: Date): boolean {
    const day = dayFromNative(date);
    /*
     * The rules are deliberately clock-free, so "not in the past" is decided here. A published
     * rate can start well before today — a season opened in July is still the rate in August —
     * and without this the calendar offers days that have already been and gone.
     */
    if (day < today) return true;
    /* Keep the chosen check-in clickable so a mis-click can be redone in place. */
    if (checkIn !== null) return day !== checkIn && !combinedCanCheckOut(day, checkIn, offers);
    return !combinedCanCheckIn(day, offers);
  }

  /*
   * Why this particular day is unavailable, where we are willing to say. Read from the vendors'
   * calendars rather than from `isDayDisabled`, which refuses far more days than are actually
   * taken - a turnaround weekday is not a booking, and marking it as one would be a lie about
   * the boat.
   */
  function dayModifier(date: Date) {
    const status = occupancyStatusOn(dayFromNative(date), offers);
    if (!status) return undefined;
    return { className: cn(OCCUPANCY_TINT[status], MARKED_DAY), label: t(`day.${status}`) };
  }

  function handleChange(next: DateRange | undefined) {
    if (next?.from && !next.to) {
      /*
       * A listing whose rules leave one legal end needs no second click, and asking for one is
       * worst on exactly the listings whose calendars are emptiest: the visitor is sent hunting
       * for the single day that is not greyed out.
       */
      const forced = onlyCheckOut(dayFromNative(next.from), offers);
      if (forced) {
        commit({ checkIn: dayFromNative(next.from), checkOut: forced });
        return;
      }
    }

    setPending(next);
    if (!next?.from || !next.to) return;

    commit({ checkIn: dayFromNative(next.from), checkOut: dayFromNative(next.to) });
  }

  /* Both ends are in, so close: leaving the month grid up hides the price it just bought. */
  function commit(period: CharterPeriod) {
    setPending(undefined);
    setOpen(false);
    onSelect(period);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <DatePicker
        mode="range"
        value={range}
        onValueChange={handleChange}
        disabled={disabled ? alwaysDisabled : isDayDisabled}
        dayModifier={disabled ? undefined : dayModifier}
        legend={<OccupancyLegend />}
        defaultMonth={openMonth ? dayToNative(openMonth) : undefined}
        hint={periodLabel ?? undefined}
        open={open}
        onOpenChange={setOpen}
        dateFormat="dayShort"
        placeholder={placeholder}
        triggerClassName={triggerClassName}
      />
      {/*
        Always shown, because the calendar already refuses the days these rules exclude and a
        grid of greyed-out dates with no explanation reads as "booked solid" or a broken
        picker. Absent entirely when the listing constrains nothing, so a fully flexible boat
        does not carry a line that says so.
      */}
      {periodLabel ? <p className="text-sm leading-[1.3] text-natural-500">{periodLabel}</p> : null}
    </div>
  );
}

/* Under the grid rather than beside each cell: two colours need saying once, not thirty times. */
function OccupancyLegend() {
  const t = useTranslations("Common.charterPeriod");

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-natural-50 px-3 py-2 text-sm leading-[1.3] text-natural-600">
      {(["booked", "held"] as const).map((status) => (
        <li key={status} className="flex items-center gap-2">
          <span aria-hidden className={cn("size-3 rounded-xs", OCCUPANCY_TINT[status])} />
          {t(`day.${status}`)}
        </li>
      ))}
    </ul>
  );
}

function alwaysDisabled(): boolean {
  return true;
}

/** The one legal check-out for this check-in, or null where the visitor still has a choice. */
function onlyCheckOut(checkIn: string, offers: readonly OfferConstraints[]): string | null {
  const days = combinedLegalCheckOuts(checkIn, offers);
  return days.length === 1 ? (days[0] ?? null) : null;
}
