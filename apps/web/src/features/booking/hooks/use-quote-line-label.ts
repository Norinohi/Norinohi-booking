"use client";

import { useTranslations } from "next-intl";

import type { QuoteLine } from "../api/queries";

/**
 * Our own line names, as opposed to the provider's.
 *
 * A promo the operator configured carries its own name and is data; everything named here is
 * copy this app writes. A code with no entry keeps the label the API sent, which is what an
 * operator-named promo needs.
 *
 * The two vendor discounts are in the list because their name is ours too, despite arriving on
 * a provider line. Booking Manager names none, so its adapter falls back to a fixed English
 * "Charter discount", which is what a Ukrainian checkout used to print under its own total.
 * NauSYS names its own ("Early booking"), and that name is kept beside ours.
 */
type QuoteLineKey = "referral-welcome" | "referral-credit" | "provider-discount";

const QUOTE_LINE_KEY = new Map<string, QuoteLineKey>([
  ["referral-welcome", "referral-welcome"],
  ["referral-credit", "referral-credit"],
  ["bm-discount", "provider-discount"],
]);

/** NauSYS names one line per discount step, each keyed by the step's own vendor id. */
const NAUSYS_DISCOUNT_PREFIX = "nausys-discount-";

/** The adapters' placeholder when a discount has no name; see `DEFAULT_LINE_LABELS`. */
const GENERIC_DISCOUNT_LABEL = "Charter discount";

/**
 * Shared by the sidebar and the review step because they name the same lines. The review step
 * printed `line.label` raw, so the sidebar could say one thing about a charge and the last
 * screen before payment another.
 */
export function useQuoteLineLabel() {
  const t = useTranslations("Common.quoteLines");

  return (line: QuoteLine) => {
    const key = line.code.startsWith(NAUSYS_DISCOUNT_PREFIX)
      ? "provider-discount"
      : QUOTE_LINE_KEY.get(line.code);
    /* A NauSYS discount the operator named keeps the name beside ours: two discounts on one
       charter used to read as two identical lines. */
    if (
      key === "provider-discount" &&
      line.code.startsWith(NAUSYS_DISCOUNT_PREFIX) &&
      line.label.trim() !== "" &&
      line.label !== GENERIC_DISCOUNT_LABEL
    ) {
      return `${t(key)} (${line.label})`;
    }
    return key ? t(key) : line.label;
  };
}
