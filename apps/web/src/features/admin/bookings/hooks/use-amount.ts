import { useFormatter } from "next-intl";

/*
 * Money on the admin queues, formatted in the currency the row actually carries.
 * The app-wide useMoney() is EUR-only, which is right for a catalogue priced in one
 * currency but wrong here: staff settle a transfer and return a refund in whatever the
 * booking was quoted in, and a Croatian kuna total labelled € is a payment error.
 */
export function useAmount() {
  const format = useFormatter();

  return (money: { amountMinor: number; currency: string }) =>
    format.number(money.amountMinor / 100, {
      style: "currency",
      currency: money.currency,
    });
}
