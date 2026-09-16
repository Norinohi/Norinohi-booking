"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";
import type { AppPathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";

import type { Quote } from "../../api/queries";
import { Separator } from "./separator";

export interface SummaryCtaProps {
  quote: Quote;
  repricing: boolean;
  actions: boolean;
  payNowHref?: AppPathname;
  onRequestQuote?: () => void;
  onRequestBooking?: () => void;
}

/** The total, what is due now, and the Pay Now / booking request / Request Quote actions. */
export function SummaryCta({
  quote,
  repricing,
  actions,
  payNowHref,
  onRequestQuote,
  onRequestBooking,
}: SummaryCtaProps) {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const money = useMoney();
  /* Never hand Pay Now a live link over a stale amount. */
  const payNowReady = payNowHref !== undefined && !repricing;

  return (
    <div className="flex shrink-0 flex-col border-t border-border bg-card">
      <div className="flex w-full flex-col items-center gap-1 p-4 xl:py-3">
        <p className="text-sm leading-4.5 font-medium text-natural-500">
          {t("sidebar.totalPrice")}
        </p>
        {repricing ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <p className="text-h4 leading-9 font-bold text-foreground">
            {money(quote.total.amountMinor, quote.total.currency)}
          </p>
        )}
        {quote.perPerson ? (
          <p className="text-sm leading-4.5 font-medium text-natural-500">
            {tCard("perPersonApprox", {
              price: money(quote.perPerson.amountMinor, quote.perPerson.currency),
            })}
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="flex w-full flex-col gap-3 p-4 xl:gap-2 xl:py-3">
        {/* Nothing is due on a request: the operator has not confirmed the charter yet. */}
        {onRequestBooking ? null : (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm leading-4.5 font-medium text-natural-500">
              {t("sidebar.dueNow")}
            </p>
            {repricing ? (
              <Skeleton className="h-14 w-40" />
            ) : (
              <p className="text-h3 leading-14 text-foreground">
                {money(quote.deposit.amountMinor, quote.deposit.currency)}
              </p>
            )}
          </div>
        )}
        {actions && onRequestBooking ? (
          <>
            <Button variant="brand" loading={repricing} onClick={onRequestBooking}>
              {t("sidebar.requestBookingCta")}
            </Button>
            <p className="text-sm leading-[1.3] text-natural-500">
              {t("sidebar.requestBookingHint")}
            </p>
          </>
        ) : actions ? (
          <>
            <Button
              variant="brand"
              loading={repricing}
              disabled={!payNowReady}
              nativeButton={payNowReady ? false : undefined}
              render={payNowReady ? <Link href={payNowHref} /> : undefined}
            >
              {t("sidebar.payNowCta", {
                amount: money(quote.deposit.amountMinor, quote.deposit.currency),
              })}
            </Button>
            <Button variant="neutral" onClick={onRequestQuote}>
              {t("sidebar.requestQuote")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
