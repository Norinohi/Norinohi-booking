import { useTranslations } from "next-intl";

import { useExactMoney, useMoney } from "./use-money";

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
  | "service"
  | "piece"
  | "weekStarted"
  | "oneWay"
  | "weekPerson"
  | "weekFood"
  | "dayPerson"
  | "bookingPerson"
  | "pet"
  | "cabin"
  | "twoWeeks"
  | "hour"
  | "engineHour"
  | "halfHour"
  | "crewChange"
  | "personCourse"
  | "boat"
  | "pack"
  | "bottle"
  | "licence"
  | "meal"
  | "nauticalMile"
  | "roundTrip"
  | "litre"
  | "weekStartedPerson";

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
  ["per piece", "piece"],
  ["per week started", "weekStarted"],
  ["one way", "oneWay"],
  ["per week person", "weekPerson"],
  ["per guest week", "weekPerson"],
  ["per week food", "weekFood"],
  ["per guest day", "dayPerson"],
  ["per day person", "dayPerson"],
  ["per person day", "dayPerson"],
  ["per guest night", "nightPerson"],
  ["per person night", "nightPerson"],
  ["per booking person", "bookingPerson"],
  ["per booking crew", "booking"],
  ["per pet", "pet"],
  ["per cabin", "cabin"],
  ["per 2 weeks", "twoWeeks"],
  ["per hour", "hour"],
  ["per running hour", "engineHour"],
  ["half an hour", "halfHour"],
  ["per crew change", "crewChange"],
  ["per person per course", "personCourse"],
  ["per boat", "boat"],
  ["per pack", "pack"],
  ["per bottle", "bottle"],
  ["per licence", "licence"],
  ["per meal", "meal"],
  ["per nautical mile", "nauticalMile"],
  ["round trip", "roundTrip"],
  ["per liter", "litre"],
  ["per week started person", "weekStartedPerson"],
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
export function useExtraPrice(options: { exact?: boolean } = {}) {
  const t = useTranslations("Common.extras.measure");
  const rounded = useMoney();
  const exactMoney = useExactMoney();
  /* Exact where a unit rate explains a charged total: 1.33 a night rounded to 1 no longer adds up. */
  const money = options.exact ? exactMoney : rounded;

  /*
   * `toMinor` is the top of a range, for a fee the provider keys as several variants at
   * different prices — one cleaning fee per base pair, say. Only one is ever charged, and
   * which one needs dates and a route, so an undated catalogue quotes the span.
   */
  return (
    amountMinor: number,
    measure?: string | null,
    toMinor?: number | null,
    currency?: string,
  ) => {
    const price =
      toMinor == null || toMinor === amountMinor
        ? money(amountMinor, currency)
        : `${money(amountMinor, currency)}–${money(toMinor, currency)}`;
    // No measure at all is the vendors' way of pricing the whole booking.
    if (measure === null || measure === undefined || measure.trim() === "") {
      return t("booking", { price });
    }

    const text = levelled(measure);
    const key = MEASURE_KEY_BY_TEXT.get(text);
    return key === undefined ? `${price} ${text}` : t(key, { price });
  };
}
