"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";

import { useChargeMoney, useExactMoney } from "@/hooks/use-money";
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
  const money = useExactMoney();
  const charge = useChargeMoney();
  /*
   * Due now reads in the same currency as every other figure in the sidebar: a total in hryvnia
   * above a due-now in euro read as two different bookings. The card is charged in the quote's
   * own currency, though, so where the two differ the real charge is stated under the figure and
   * the button drops its amount rather than promise a sum in a currency nobody debits.
   */
  const dueNowShown = money(quote.deposit.amountMinor, quote.deposit.currency);
  const charged = charge(quote.deposit.amountMinor, quote.deposit.currency);
  const converted = dueNowShown !== charged;
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
              <>
                <p className="text-h3 leading-14 text-foreground">{dueNowShown}</p>
                {converted ? (
                  <p className="text-center text-sm leading-4.5 font-medium text-natural-500">
                    {t("sidebar.chargedAs", { amount: charged })}
                  </p>
                ) : null}
              </>
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
              {converted ? t("sidebar.payNowPlain") : t("sidebar.payNowCta", { amount: charged })}
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
