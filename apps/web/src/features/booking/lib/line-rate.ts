/** The catalogue fields that say what a fee's price is per. */
export interface RateSource {
  code: string;
  price: { amountMinor: number; currency: string };
  priceToMinor: number | null;
  priceMeasure: string | null;
  percentage: number | null;
}

export interface LineRate {
  amountMinor: number;
  currency: string;
  measure: string;
}

/**
 * The vendor's unit rate behind a priced quote line, for a caption under its name.
 *
 * A line carries the vendor's total and the operator's own name for the fee, and the two can
 * disagree about the unit: Booking Manager's "Tourist tax per pax" is billed per night, so the
 * 9.31 on a two-guest week read as nine euro a head. The measure is the vendor's statement of
 * what the price is per, so it is shown beside the total rather than letting the name imply one.
 *
 * Null where there is nothing honest to show: no catalogue row, a share of the charter, no
 * measure, several variants at different prices, or a rate in another currency than the line.
 */
export function vendorRateFor(
  line: { code: string; amount: { amountMinor: number; currency: string } },
  catalogue: readonly RateSource[],
): LineRate | null {
  const item = catalogue.find((entry) => entry.code === line.code);
  if (!item || item.percentage !== null) return null;

  const measure = item.priceMeasure?.trim();
  if (!measure) return null;
  if (item.priceToMinor !== null && item.priceToMinor !== item.price.amountMinor) return null;
  if (item.price.amountMinor <= 0 || item.price.currency !== line.amount.currency) return null;

  return { amountMinor: item.price.amountMinor, currency: item.price.currency, measure };
}
