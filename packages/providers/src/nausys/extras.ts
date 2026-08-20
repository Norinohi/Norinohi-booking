import type { z } from "zod";

import { decimalStringToMinor } from "../shared/money";
import type { restExtraSchema } from "./endpoints";

type RestExtra = z.infer<typeof restExtraSchema>;

/**
 * What this entry costs on this charter.
 *
 * The vendor's own line total, where it exists. Production always sends it, and
 * rounding a unit price is their decision rather than ours.
 *
 * Where it does not, `amount` is multiplied by `quantity`. NauSYS settled this
 * twice (Aug 2026): `amount` is the unit price "without calculated quantity", and
 * asked to adjudicate their own documented counter-example — a `quantity: 10`
 * extra that raises `totalPriceWithExtras` by one times `amount` — they confirmed
 * the real response (`amount: 10.00`, `quantity: 10.00`, `totalPrice: 100.00`) is
 * right and the documentation example is a mistake they will fix. So the customer
 * is charged 100.00 there, and a missing total is a product, not an ambiguity.
 *
 * Rounded because `quantity` can be fractional (hours, days); with an integer
 * quantity, the common case, this is exact.
 *
 * Shared by the quote and the booking: `freeYachts` extras and a reservation's
 * `services`/`additionalEquipment` are the same shape, so pricing them two
 * different ways can only ever mean one of the two is wrong.
 */
export function extraLineMinor(extra: RestExtra, currency: string): number {
  const amountMinor = decimalStringToMinor(extra.amount, currency);
  return extra.totalPrice === undefined
    ? Math.round(amountMinor * quantityOf(extra))
    : decimalStringToMinor(extra.totalPrice, currency);
}

/** `quantity` is a decimal string ("1.00", "10.00"); absent or unreadable is one. */
function quantityOf(extra: RestExtra): number {
  if (extra.quantity === undefined) return 1;
  const parsed = Number(extra.quantity.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
