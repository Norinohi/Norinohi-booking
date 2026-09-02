import type { z } from "zod";

import { ContractError } from "../shared/errors";
import { decimalStringToMinor } from "../shared/money";
import type { restFreeYachtSchema } from "./endpoints";

type RestPrice = z.infer<typeof restFreeYachtSchema>["price"];
type RestDiscount = NonNullable<RestPrice["discounts"]>[number];

export interface DiscountStep {
  discount: RestDiscount;
  amountMinor: number;
}

/** What the vendor's discounts came to, and what they leave of the list price. */
export interface DiscountWalk {
  steps: DiscountStep[];
  netMinor: number;
}

/**
 * The vendor's own discounts, applied in the order it lists them, and what they leave.
 *
 * `clientPrice` is `priceListPrice` minus each of these in turn, so walking them is the only
 * way to tell a reduction we can account for from a difference we cannot. Percentages apply to
 * what is left after the previous discount, which is the only order that reproduces
 * `clientPrice` on the multi-discount offers.
 */
export function walkDiscounts(
  discounts: readonly RestDiscount[],
  listPriceMinor: number,
  currency: string,
): DiscountWalk {
  const steps: DiscountStep[] = [];
  let netMinor = listPriceMinor;

  for (const discount of discounts) {
    const amountMinor = discountAmountMinor(discount, netMinor, currency);
    netMinor -= amountMinor;
    steps.push({ discount, amountMinor });
  }

  return { steps, netMinor };
}

/**
 * The list price to strike through, or nothing.
 *
 * Nothing unless the discounts add up exactly to the price the vendor bills. Where they do not,
 * it is doing something we do not model, and a strike-through would be our arithmetic presented
 * as the operator's offer. The quote applies the same test before it emits discount lines, so
 * the two surfaces agree on whether this charter is discounted at all.
 */
export function reconciledListPriceMinor(price: RestPrice, currency: string): number | undefined {
  let listPriceMinor: number;
  let clientPriceMinor: number;
  try {
    listPriceMinor = decimalStringToMinor(price.priceListPrice, currency);
    clientPriceMinor = decimalStringToMinor(price.clientPrice, currency);
  } catch {
    /* A figure we cannot read is a strike-through we do not draw. The offer itself is still
       worth writing, and its own price is parsed by the caller. */
    return undefined;
  }

  if (listPriceMinor <= clientPriceMinor) return undefined;

  const { steps, netMinor } = walkDiscounts(price.discounts ?? [], listPriceMinor, currency);
  if (steps.length === 0 || netMinor !== clientPriceMinor) return undefined;

  return listPriceMinor;
}

export function discountAmountMinor(
  discount: RestDiscount,
  runningMinor: number,
  currency: string,
): number {
  if (discount.type === "PERCENTAGE") {
    const percentage = Number(discount.amount);
    if (!Number.isFinite(percentage)) {
      throw new ContractError(
        `NauSYS discount ${discount.discountItemId} has a non-numeric percentage`,
      );
    }
    return Math.round((runningMinor * percentage) / 100);
  }
  if (discount.type === "AMOUNT") {
    return decimalStringToMinor(String(discount.amount), currency);
  }
  throw new ContractError(
    `Unknown NauSYS discount type ${JSON.stringify(discount.type)} on item ${discount.discountItemId}`,
  );
}
