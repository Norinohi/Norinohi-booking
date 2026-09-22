"use client";

import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { CircleCheckBig, Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { useExactMoney } from "@/hooks/use-money";

import type { Quote } from "../../api/queries";

export interface PriceHeadlineProps {
  quote: Quote;
  repricing: boolean;
  depositWhenInsured?: { amountMinor: number; currency: string } | null;
}

/** The prepayment share, then the boat price and the refundable deposit side by side. */
export function PriceHeadline({ quote, repricing, depositWhenInsured }: PriceHeadlineProps) {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const money = useExactMoney();

  const base = quote.lines.find((line) => line.kind === "base");
  const discounts = quote.lines.filter((line) => line.kind === "discount");
  /*
   * The headline is what the charter actually costs, so every discount on the quote comes off
   * it and the undiscounted figure is struck through beside it. The base line is the price
   * BEFORE any reduction - a provider that discounts sends `startPrice` as the base and the
   * cut as its own line - so showing the base alone put the highest number in the largest type
   * and left the customer to find the correction three sections further down.
   *
   * `discounts` is still itemised below: this says what you pay, that says where it came from.
   */
  const baseMinor = (base ?? quote.lines[0])?.amount.amountMinor ?? 0;
  const discountMinor = discounts.reduce((total, line) => total + line.amount.amountMinor, 0);
  const netBaseMinor = baseMinor + discountMinor;
  /* Only when it genuinely reduces: a zero or positive adjustment has nothing to strike. */
  const showStruckBase = discountMinor < 0 && netBaseMinor > 0;
  const rawPct = quote.paymentPolicy.mode === "full" ? 100 : quote.paymentPolicy.depositPct;
  const prepaymentPercent = rawPct > 1 ? Math.round(rawPct) : Math.round(rawPct * 100);
  /*
   * A zero deposit is the operator saying it takes none, which the card already reads that way
   * and omits. The sidebar printed it as "Refundable deposit EUR 0" beside a gulet whose crew,
   * linen and cleaning it was also pricing at zero -- a column of nothings where the honest
   * answer is one fewer line.
   */
  const deposit =
    quote.securityDeposit && quote.securityDeposit.amountMinor > 0 ? quote.securityDeposit : null;
  /*
   * The waiver's reduced deposit, shown only while it would still change something: once the
   * guest selects the waiver the quote comes back with the lower deposit already applied, and
   * the two figures agree. Comparing against the quote rather than tracking the selection keeps
   * this true whichever way the deposit got there.
   */
  const insuredDeposit =
    depositWhenInsured &&
    deposit &&
    depositWhenInsured.currency === deposit.currency &&
    depositWhenInsured.amountMinor < deposit.amountMinor
      ? depositWhenInsured
      : null;

  const boatText = money(showStruckBase ? netBaseMinor : baseMinor, quote.total.currency);
  const depositText = deposit ? money(deposit.amountMinor, deposit.currency) : "";
  /*
   * Two amounts share the row at 24px, which a euro figure fits and a hryvnia one does not:
   * "888 651 грн" beside "77 051 грн" ran into each other. The spaces in a formatted number do
   * not break, so the type steps down instead, and for both at once so the pair stays even.
   */
  const crowded = deposit !== null && Math.max(boatText.length, depositText.length) > 9;
  const amountSize = crowded ? "text-lg leading-8" : "text-2xl leading-8";

  return (
    <>
      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-4 py-3">
        <CircleCheckBig className="size-4 shrink-0 text-brand" />
        <span className="text-sm leading-4.5 font-bold text-brand">
          {t("sidebar.prepayment", { percent: prepaymentPercent })}
        </span>
      </div>

      {/*
        One grid, filled column by column, so the two figures share their rows: label,
        amount, footnote. However the labels wrap at this width, the amounts stay on
        one line, and a short label bottom-aligns against its neighbour's last line.
        The explanation the price label used to carry in brackets is the footnote now,
        where it can run long without pushing the amount down.
      */}
      <div
        className={cn(
          "grid grid-flow-col grid-rows-[auto_auto_auto] gap-x-1.5 gap-y-1",
          deposit ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        <p className="self-end text-sm leading-4.5 font-medium text-natural-500">
          {t("sidebar.boatPrice")}
        </p>
        {repricing ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p
            className={cn(
              "flex flex-wrap items-baseline gap-x-1.5 font-semibold text-foreground",
              amountSize,
            )}
          >
            {boatText}
            {showStruckBase ? (
              <span className="text-base leading-6 font-medium text-natural-500 line-through">
                {money(baseMinor, quote.total.currency)}
              </span>
            ) : null}
          </p>
        )}
        <p className="text-xs leading-4 font-medium text-natural-500">
          {/* The footnote names the figure above it, which the strikethrough changed:
              "full rental price" is the struck number now, not the one in large type. */}
          {t(showStruckBase ? "sidebar.boatPriceHintDiscounted" : "sidebar.boatPriceHint")}
        </p>

        {deposit ? (
          <>
            <p className="self-end text-right text-sm leading-4.5 font-medium text-natural-500">
              {t("sidebar.deposit")}
            </p>
            {repricing ? (
              <Skeleton className="h-8 w-24 justify-self-end" />
            ) : (
              <p className={cn("text-right font-semibold text-foreground", amountSize)}>
                {depositText}
              </p>
            )}
            <div className="flex flex-col items-end gap-1 justify-self-end">
              {/* Only while the waiver is still an offer. Once the guest selects it the
                  quote's own deposit IS the reduced figure, and repeating it here would
                  read as a second, further reduction. */}
              {insuredDeposit ? (
                <p className="text-right text-xs leading-4 font-medium text-natural-500">
                  {t("sidebar.depositWhenInsured", {
                    amount: money(insuredDeposit.amountMinor, insuredDeposit.currency),
                  })}
                </p>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1 text-xs leading-4 font-semibold text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                  }
                >
                  <Info className="size-4 shrink-0" />
                  {t("sidebar.howItWorks")}
                </TooltipTrigger>
                <TooltipContent>{tCard("securityDepositInfo")}</TooltipContent>
              </Tooltip>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
