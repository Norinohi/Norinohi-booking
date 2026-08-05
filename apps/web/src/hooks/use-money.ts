import { useFormatter } from "next-intl";

export function useMoney() {
  const format = useFormatter();
  return (amountMinor: number) => format.number(amountMinor / 100, "eur");
}
