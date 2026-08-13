import { ContractError } from "../shared/errors";
import { currencyExponent, decimalStringToMinor } from "../shared/money";

/**
 * Booking Manager ships money as JSON numbers, which are binary floats: 1234.35
 * is already not exactly 1234.35 by the time Zod has it. Pinning the precision at
 * the currency's own exponent is the only honest place to collapse that, and the
 * decimal string then goes through the shared converter like every other adapter.
 *
 * Deliberately not in `shared/money.ts`: NauSYS ships decimal strings and calls
 * `decimalStringToMinor` directly, so a shared float-tolerant helper would
 * advertise a capability the shared layer exists to prevent.
 */
export function numberToMinor(value: number, currency: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractError(
      `Booking Manager ${field} is not a finite number: ${JSON.stringify(value)}`,
    );
  }
  return decimalStringToMinor(value.toFixed(currencyExponent(currency)), currency);
}
