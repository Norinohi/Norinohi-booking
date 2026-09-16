"use client";

import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";

import type { QuoteLine } from "../../api/queries";
import { useQuoteLineLabel } from "../../hooks/use-quote-line-label";

export interface DiscountRowsProps {
  lines: QuoteLine[];
}

/*
 * Every discount on the quote, listed. Discount lines carry no `group` (see `QuoteLine`), so
 * the sections above cannot show them, and until they were rendered here the money simply
 * vanished: a provider discount moved the total with nothing on screen to account for it.
 * One row per line rather than a single summed "Discounts" — a provider discount, a promo code
 * and the referral welcome are different things, and the labels are the only place that shows.
 */
export function DiscountRows({ lines }: DiscountRowsProps) {
  const t = useTranslations("YachtDetail");
  const money = useMoney();
  const labelOf = useQuoteLineLabel();

  return (
    <div className="flex w-full flex-col gap-3 p-4">
      {/*
       * Sitting bare above Total, these rows read as a second subtraction from a figure that
       * already contains them - the boat price above is struck through by the very same amount.
       * The heading says they explain that reduction rather than repeat it.
       */}
      <p className="text-sm leading-4.5 font-medium text-natural-500">
        {t("sidebar.discountsHeading")}
      </p>
      {lines.map((line) => (
        <div key={line.code} className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base leading-5.5 text-foreground">{labelOf(line)}</p>
          <p className="shrink-0 text-base leading-5.5 font-bold text-positive-600">
            {money(line.amount.amountMinor, line.amount.currency)}
          </p>
        </div>
      ))}
    </div>
  );
}
