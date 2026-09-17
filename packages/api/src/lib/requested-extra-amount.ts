/**
 * What a requested extra adds to a charter, from its catalogue unit price.
 *
 * The vendor will not price these on the offer, so the quote multiplies the operator's published
 * rate by the quantity its measure implies for this charter. A charter's days are its nights:
 * a Saturday-to-Saturday week is sold and billed as seven days.
 *
 * A measure this cannot count for the customer - hours, nautical miles, cabins - returns null and
 * the extra stays a request the base prices, rather than a guess added to the total.
 */

export type ChargeBasis = {
  nights: number;
  guests: number;
  /** The charter price, for a fee stated as a share of it. */
  baseMinor: number;
};

export type CatalogueRate = {
  priceMinor: number;
  priceMeasure: string | null;
  percentage: number | null;
  included: boolean;
};

type Quantity = (basis: ChargeBasis) => number;

const once: Quantity = () => 1;
const perNight: Quantity = ({ nights }) => nights;
const perWeek: Quantity = ({ nights }) => Math.max(Math.ceil(nights / 7), 1);
const perPerson: Quantity = ({ guests }) => guests;
const perPersonWeek: Quantity = (basis) => perWeek(basis) * basis.guests;
const perPersonNight: Quantity = (basis) => basis.nights * basis.guests;

/* Keyed on the measure lowercased with punctuation levelled to single spaces, which folds
   Booking Manager's codes (`per_week_started`) and NauSYS prose ("per guest/day") together. */
const QUANTITY_BY_MEASURE: ReadonlyMap<string, Quantity> = new Map([
  ["", once],
  ["per booking", once],
  ["per booking crew", once],
  ["per service", once],
  ["per set", once],
  ["per piece", once],
  ["per pack", once],
  ["per bottle", once],
  ["per meal", once],
  ["per pet", once],
  ["per boat", once],
  ["per licence", once],
  ["per crew change", once],
  ["one way", once],
  ["round trip", once],
  ["per night", perNight],
  ["per day", perNight],
  ["per day food", perNight],
  ["per week", perWeek],
  ["per week started", perWeek],
  ["per week food", perWeek],
  ["per 2 weeks", ({ nights }) => Math.max(Math.ceil(nights / 14), 1)],
  ["per person", perPerson],
  ["per person per course", perPerson],
  ["one way person", perPerson],
  ["per week person", perPersonWeek],
  ["per guest week", perPersonWeek],
  ["per night person", perPersonNight],
  ["per guest day", perPersonNight],
  ["per guest night", perPersonNight],
  ["per person day", perPersonNight],
  ["per person night", perPersonNight],
]);

export function levelMeasure(measure: string | null): string {
  return (measure ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Minor units the extra adds, or null where nothing can honestly be added. */
export function requestedExtraAmountMinor(rate: CatalogueRate, basis: ChargeBasis): number | null {
  if (rate.included) return null;
  if (rate.percentage !== null) {
    const amount = Math.round(basis.baseMinor * rate.percentage);
    return amount > 0 ? amount : null;
  }
  // A zero is the vendor publishing no rate, not a free extra.
  if (rate.priceMinor <= 0) return null;

  const quantity = QUANTITY_BY_MEASURE.get(levelMeasure(rate.priceMeasure));
  return quantity === undefined ? null : rate.priceMinor * quantity(basis);
}
