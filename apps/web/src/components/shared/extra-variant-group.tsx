"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";

import { useExactMoney, useMoney } from "@/hooks/use-money";

export interface ExtraVariant {
  code: string;
  detail: string | null;
  amount: { amountMinor: number; currency: string };
  payWhen: "now" | "at_check_in";
}

/*
 * An extra the offer sells as several alternatives, a transfer by route and vehicle, say. The
 * extra itself is a heading and each variant is its own box, because the extra's code alone
 * names no route: ticking it used to buy all seven transfers at once. Boxes rather than radios,
 * since a party can need two of them, one taxi out and a minivan back.
 *
 * Shared by the yacht page and the booking wizard, which list the same offer.
 */
export function ExtraVariantGroup({
  label,
  variants,
  selected,
  onChange,
  repricing = false,
  exact = false,
}: {
  label: string;
  variants: readonly ExtraVariant[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  repricing?: boolean;
  /** Exact amounts, where a total beside them has to add up to the cent. */
  exact?: boolean;
}) {
  const t = useTranslations("Common.extras");
  const rounded = useMoney();
  const exactMoney = useExactMoney();
  const money = exact ? exactMoney : rounded;
  const cheapest = variants.reduce((low, variant) =>
    variant.amount.amountMinor < low.amount.amountMinor ? variant : low,
  );

  return (
    <div className="flex flex-col border-b border-dashed border-border pt-3 pb-2.75">
      <div className="flex items-start gap-2">
        <span aria-hidden className="size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-base leading-5.5 text-foreground">{label}</p>
          <p className="text-xs font-semibold text-natural-300">{t("chooseVariants")}</p>
        </div>
        {repricing ? (
          <Skeleton className="h-5.5 w-24 shrink-0" />
        ) : (
          <p className="shrink-0 text-base font-bold text-foreground">
            {t("fromPrice", {
              price: money(cheapest.amount.amountMinor, cheapest.amount.currency),
            })}
          </p>
        )}
      </div>

      <div className="flex flex-col pl-6">
        {variants.map((variant) => (
          <label key={variant.code} className="flex cursor-pointer items-start gap-2 pt-3">
            <Checkbox
              checked={selected.includes(variant.code)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, variant.code]
                    : selected.filter((code) => code !== variant.code),
                )
              }
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm leading-5 text-foreground">{variant.detail ?? label}</span>
              <span className="text-xs font-semibold text-natural-300">
                {variant.payWhen === "at_check_in" ? t("payAtCheckIn") : t("payNow")}
              </span>
            </span>
            {repricing ? (
              <Skeleton className="h-5 w-20 shrink-0" />
            ) : (
              <span className="shrink-0 text-sm font-bold text-foreground">
                {money(variant.amount.amountMinor, variant.amount.currency)}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
