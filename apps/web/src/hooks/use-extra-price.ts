import { useTranslations } from "next-intl";

import { useMoney } from "./use-money";

type MeasureKey =
  | "booking"
  | "day"
  | "night"
  | "week"
  | "person"
  | "nightPerson"
  | "dayWithFood"
  | "oneWayPerson"
  | "set"
  | "service";

/**
 * Each provider states what an extra's price is per in its own words: Booking Manager sends
 * codes (`per_night_person`), NauSYS passes on the operator's prose ("one-way / person").
 * Levelling punctuation collapses both onto the same handful of measures, so one table serves
 * the two of them.
 */
const MEASURE_KEY_BY_TEXT: ReadonlyMap<string, MeasureKey> = new Map([
  ["per booking", "booking"],
  ["per day", "day"],
  ["per night", "night"],
  ["per week", "week"],
  ["per person", "person"],
  ["per night person", "nightPerson"],
  ["per day food", "dayWithFood"],
  ["one way person", "oneWayPerson"],
  ["per set", "set"],
  ["per service", "service"],
]);

const levelled = (measure: string) =>
  measure
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * An extra's catalogue price with the measure it is charged against.
 *
 * A measure this does not recognise is shown as the provider wrote it, minus the punctuation:
 * a new one appearing in a sync should read a little rough rather than be relabelled "per
 * booking" and understate what the charter will be billed.
 */
export function useExtraPrice() {
  const t = useTranslations("Common.extras.measure");
  const money = useMoney();

  /*
   * `toMinor` is the top of a range, for a fee the provider keys as several variants at
   * different prices — one cleaning fee per base pair, say. Only one is ever charged, and
   * which one needs dates and a route, so an undated catalogue quotes the span.
   */
  return (amountMinor: number, measure?: string | null, toMinor?: number | null) => {
    const price =
      toMinor == null || toMinor === amountMinor
        ? money(amountMinor)
        : `${money(amountMinor)}–${money(toMinor)}`;
    // No measure at all is the vendors' way of pricing the whole booking.
    if (measure === null || measure === undefined || measure.trim() === "") {
      return t("booking", { price });
    }

    const text = levelled(measure);
    const key = MEASURE_KEY_BY_TEXT.get(text);
    return key === undefined ? `${price} ${text}` : t(key, { price });
  };
}
