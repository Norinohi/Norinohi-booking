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
export function extraLineMinor(
  extra: RestExtra,
  currency: string,
  basis?: PercentageBasis,
): number {
  if (isIncludedInCharterPrice(extra)) return 0;

  /* The vendor's own total wins whatever the shape, and on an offer it is always sent. */
  if (extra.totalPrice !== undefined) return decimalStringToMinor(extra.totalPrice, currency);

  if (extra.amountIsPercentage === true) return percentageLineMinor(extra, basis);

  const amountMinor = decimalStringToMinor(extra.amount, currency);
  return Math.round(amountMinor * quantityOf(extra));
}

/**
 * What a rate applies to, in minor units, as far as the caller knows it.
 *
 * NauSYS names four bases and we can supply two of them from an offer. A rate against one we
 * cannot value is left uncharged rather than guessed: the alternative is inventing a line the
 * customer then does not owe, and the quote's own reconciliation would hide it.
 */
export interface PercentageBasis {
  /** `PRICELIST_PRICE`, and the nearest thing we have to the without-VAT variant. */
  listMinor?: number | undefined;
  /** `CLIENT_PRICE`, the charter after the vendor's discounts. */
  clientMinor?: number | undefined;
  /** The charter's length in days, for `DAILY_PRICE`, the list price per day. */
  days?: number | undefined;
}

/**
 * A percentage line, computed the way the vendor computes it.
 *
 * `amount` here is a rate to four decimals ("0.3500" is 35%), widened from two in May 2022 and
 * documented as such. Read as money it is 35 cents, which is what our catalogue stored for a
 * mandatory 35% service charge worth 7,910.00 on yacht 75193633.
 */
function percentageLineMinor(extra: RestExtra, basis: PercentageBasis | undefined): number {
  const rate = Number(extra.amount);
  if (!Number.isFinite(rate) || rate <= 0 || basis === undefined) return 0;

  /*
   * AGENCY_PRICE is a share of what we pay the operator, which is our margin and is
   * deliberately never carried into a customer-facing figure. Valuing it against the list
   * price instead would overstate the fee by the commission, so it goes uncharged like any
   * other basis we cannot value.
   */
  const against = percentageBaseMinor(extra.percentageCalculationType, basis);
  return against === undefined ? 0 : Math.round(against * rate * quantityOf(extra));
}

/**
 * The figure a rate is a share of, per the PDF's `percentageCalculationType`, or undefined for
 * a basis we cannot value, which leaves the line uncharged.
 *
 * Every basis but CLIENT_PRICE and AGENCY_PRICE used to fall through to the list price: a
 * DAILY_PRICE rate (list price divided by days) came out seven times over on a week, and a
 * FINAL_CLIENT_PRICE one ignored the discounts. The VAT-exclusive bases and the one that adds
 * advance-payment extras need figures we do not hold, so they are not guessed at.
 */
function percentageBaseMinor(type: string | undefined, basis: PercentageBasis): number | undefined {
  switch (type) {
    case "PRICELIST_PRICE":
    case undefined:
      return basis.listMinor ?? basis.clientMinor;
    case "CLIENT_PRICE":
      return basis.clientMinor ?? basis.listMinor;
    /* "by default same calculation as CLIENT_PRICE" for DEFINED_IN_CUSTOM. */
    case "FINAL_CLIENT_PRICE":
    case "DEFINED_IN_CUSTOM":
      return basis.clientMinor;
    case "DAILY_PRICE":
      return basis.listMinor === undefined || !basis.days
        ? undefined
        : basis.listMinor / basis.days;
    /*
     * AGENCY_PRICE is a share of what we pay the operator, which is our margin and is
     * deliberately never carried into a customer-facing figure.
     */
    default:
      return undefined;
  }
}

/**
 * Whether the operator has already priced this service inside the charter itself.
 *
 * NauSYS keeps sending the service's list value on an INCLUDED_IN_PRICE extra, and that value
 * is not part of `clientPrice`: Altair Dufour 412 quotes 1590.00 less a 25% discount, exactly
 * 1192.50, beside an obligatory 87.00 marked included. Billing it would charge the customer
 * twice for one thing, so it costs nothing here and survives as a zero line naming what the
 * charter already covers.
 */
export function isIncludedInCharterPrice(extra: RestExtra): boolean {
  return extra.calculationType === "INCLUDED_IN_PRICE";
}

/** `quantity` is a decimal string ("1.00", "10.00"); absent or unreadable is one. */
function quantityOf(extra: RestExtra): number {
  if (extra.quantity === undefined) return 1;
  const parsed = Number(extra.quantity.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * What the operator wrote, in English where it wrote English. Each language sits in its own
 * `textXX` key and none of them is ours, so any other it filled in beats nothing.
 */
export function internationalText(
  text:
    | { textEN?: string; textDE?: string; textIT?: string; textHR?: string; textSI?: string }
    | undefined,
): string | null {
  if (text === undefined) return null;
  const texts = [text.textEN, text.textDE, text.textIT, text.textHR, text.textSI];
  return (
    texts.map((entry) => entry?.trim()).find((entry) => entry !== undefined && entry !== "") ?? null
  );
}
