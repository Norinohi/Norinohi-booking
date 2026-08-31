import { useFormatter } from "next-intl";

/*
 * Money in the currency it was quoted in, defaulting to EUR.
 *
 * The default is not a claim that everything is EUR — it is that most of what this formats
 * came back from a quote already converted. The catalogue is the exception: a provider that
 * publishes in USD lands in `listing_search_doc` in USD, and rendering $7,619 as "€7,619" is
 * not a formatting slip but a different number.
 */
export function useMoney() {
  const format = useFormatter();

  return (amountMinor: number, currency = "EUR") =>
    format.number(amountMinor / 100, { style: "currency", currency, maximumFractionDigits: 0 });
}
