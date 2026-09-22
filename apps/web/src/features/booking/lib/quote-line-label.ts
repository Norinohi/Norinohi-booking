/**
 * Our own line names, as opposed to the provider's.
 *
 * A promo the operator configured carries its own name and is data; everything named here is
 * copy this app writes. A code with no entry keeps the label the API sent, which is what an
 * operator-named promo needs.
 *
 * The two vendor discounts are in the list because their name is ours too, despite arriving on
 * a provider line. Where the vendor names none the adapter falls back to a fixed English
 * "Charter discount", which is what a Ukrainian checkout used to print under its own total. Both
 * name their own where they itemise ("Early booking"), and that name is kept beside ours.
 */
export type QuoteLineKey = "referral-welcome" | "referral-credit" | "provider-discount";

const QUOTE_LINE_KEY = new Map<string, QuoteLineKey>([
  ["referral-welcome", "referral-welcome"],
  ["referral-credit", "referral-credit"],
  ["bm-discount", "provider-discount"],
]);

/** One line per discount step the vendor itemised, each keyed by the step's own vendor id. */
const NAMED_DISCOUNT_PREFIXES = ["nausys-discount-", "bm-discount-"];

const isNamedDiscount = (code: string) =>
  NAMED_DISCOUNT_PREFIXES.some((prefix) => code.startsWith(prefix));

/** The adapters' placeholder when a discount has no name; see `DEFAULT_LINE_LABELS`. */
const GENERIC_DISCOUNT_LABEL = "Charter discount";

/** A line's name in the reader's language: ours translated, a vendor's or operator's as sent. */
export function quoteLineLabel(
  line: { code: string; label: string },
  t: (key: QuoteLineKey) => string,
): string {
  const key = isNamedDiscount(line.code) ? "provider-discount" : QUOTE_LINE_KEY.get(line.code);
  /* A discount the operator named keeps the name beside ours: two discounts on one charter
     used to read as two identical lines. */
  if (
    key === "provider-discount" &&
    isNamedDiscount(line.code) &&
    line.label.trim() !== "" &&
    line.label !== GENERIC_DISCOUNT_LABEL
  ) {
    return `${t(key)} (${line.label})`;
  }
  return key ? t(key) : line.label;
}
