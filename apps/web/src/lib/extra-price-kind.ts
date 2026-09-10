/**
 * What an extra's price line should say, decided once for the two rows that render it.
 *
 * The yacht page and the wizard's Extras step draw the same catalogue through their own
 * `ExtraRow`, and this rule was written out in both. Keeping it here is not tidiness: the two
 * copies had already agreed to call a zero "included in the price", which is the bug below.
 *
 * - `percentage`  the row carries a rate rather than money, so no figure is money.
 * - `included`    the vendor says the charter price covers it. Either the offer prices it at
 *   zero for this charter, or the catalogue marks it INCLUDED_IN_PRICE.
 * - `offered`     the offer named a figure, which is the one that will be billed.
 * - `unpriced`    no offer, and the catalogue's own price is zero. This is the vendor
 *   publishing no rate, NOT a free extra, and the two used to render alike: 12,333 optional
 *   rows sit at zero, among them Skipper, Hostess, Transfer, One way and Cancellation
 *   insurance. Exactly 15 rows in the whole catalogue are marked included, all one item, so
 *   reading a zero as "free" was wrong for four figures' worth of rows and right for fifteen.
 * - `catalogue`   a published unit price, against the measure the operator chose.
 */
export type ExtraPriceKind = "percentage" | "included" | "offered" | "unpriced" | "catalogue";

type PricedExtra = {
  percentage: number | null;
  pricingType: string;
  price: { amountMinor: number };
};

type OfferedAmount = { amount: { amountMinor: number } } | null | undefined;

export function extraPriceKind(item: PricedExtra, offered: OfferedAmount): ExtraPriceKind {
  if (item.percentage !== null) return "percentage";
  /* The offer is the authority wherever there is one: the two sources disagree on individual
     extras, and the offer is what the customer will actually be charged. */
  if (offered) return offered.amount.amountMinor === 0 ? "included" : "offered";
  if (item.pricingType === "included") return "included";
  return item.price.amountMinor === 0 ? "unpriced" : "catalogue";
}
