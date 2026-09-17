/**
 * Fraction digits for an amount the customer is actually charged or owes.
 *
 * Whole where the cents are zero, both digits where they are not: a booking whose tourist tax
 * is 9.31 totals 1,089.31, and printing 1,089 beside a staff screen that says 1,089.31 reads as
 * two different bookings. Catalogue and marketing prices stay whole through `useMoney`.
 */
export function exactFractionDigits(amountMinor: number): 0 | 2 {
  return Math.round(amountMinor) % 100 === 0 ? 0 : 2;
}
