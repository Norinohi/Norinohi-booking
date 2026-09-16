"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";

import type { Quote } from "../../api/queries";

export interface CreditFieldProps {
  offer: NonNullable<NonNullable<Quote>["creditAvailable"]>;
  applied: boolean;
  pending: boolean;
  onApply: (spend: boolean) => void;
}

/*
 * Referral credit. The quote reports both halves — `creditAvailable` is what the balance could
 * absorb here, `creditApplied` is what it is absorbing — so this needs no separate balance read,
 * and it renders nothing for a visitor with no credit or a trip under the credit minimum.
 */
export function CreditField({ offer, applied, pending, onApply }: CreditFieldProps) {
  const t = useTranslations("YachtDetail.sidebar.credit");
  const money = useMoney();

  return (
    <div className="flex w-full items-center gap-2 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-base leading-5.5 font-bold text-foreground">{t("label")}</p>
        <p
          className={cn(
            "text-sm leading-4.5 font-medium",
            applied ? "text-positive-600" : "text-natural-500",
          )}
        >
          {t(applied ? "applied" : "available", {
            amount: money(offer.amountMinor, offer.currency),
          })}
        </p>
      </div>
      <Button
        variant={applied ? "subtle" : "neutral"}
        size="sm"
        loading={pending}
        onClick={() => onApply(!applied)}
      >
        {t(applied ? "remove" : "apply")}
      </Button>
    </div>
  );
}
