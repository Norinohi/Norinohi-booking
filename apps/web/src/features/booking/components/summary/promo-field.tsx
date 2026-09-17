"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useExactMoney } from "@/hooks/use-money";

import type { Quote } from "../../api/queries";

export interface PromoFieldProps {
  applied: NonNullable<Quote>["discount"];
  rejected: NonNullable<Quote>["discountRejected"];
  pending: boolean;
  /* The discount is a share of the quote and carries no currency of its own. */
  currency: string;
  onApply: (code: string | null) => void;
}

/*
 * The promo code box. The quote is the single source of truth for what happened: `discount`
 * once a code was accepted, `discountRejected` with the reason when one was not — the server
 * still prices the charter without it rather than failing, so this explains instead of erroring.
 * Applying and removing are both reprices, which is why the whole box locks while one is in flight.
 */
export function PromoField({ applied, rejected, pending, currency, onApply }: PromoFieldProps) {
  const t = useTranslations("YachtDetail.sidebar.promo");
  const money = useExactMoney();
  const [code, setCode] = useState("");

  if (applied) {
    return (
      <div className="flex w-full items-center gap-2 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-base leading-5.5 font-bold text-foreground">{applied.code}</p>
          <p className="text-sm leading-4.5 font-medium text-positive-600">
            {t("applied", { amount: money(applied.amountMinor, currency) })}
          </p>
        </div>
        <Button variant="subtle" size="sm" loading={pending} onClick={() => onApply(null)}>
          {t("remove")}
        </Button>
      </div>
    );
  }

  const submit = () => {
    const trimmed = code.trim();
    if (trimmed.length > 0) onApply(trimmed);
  };

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      {/* `items-end` aligns the button to the bottom of the field's column, so the label above
          the input does not push the two out of line; the explicit h-12 matches the field to
          the button's own 48px rather than leaving it at whatever its padding computes to. */}
      <div className="flex items-end gap-2">
        <TextField
          containerClassName="min-w-0 flex-1"
          fieldClassName="h-12"
          label={t("label")}
          placeholder={t("placeholder")}
          value={code}
          status={rejected ? "error" : undefined}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // The sidebar sits inside no form of its own, but the booking wizard wraps it in
            // one — Enter here must apply the code, never submit the step.
            event.preventDefault();
            submit();
          }}
        />
        <Button
          variant="neutral"
          className="shrink-0"
          loading={pending}
          disabled={code.trim().length === 0}
          onClick={submit}
        >
          {t("apply")}
        </Button>
      </div>
      {rejected ? (
        <p className="text-sm leading-4.5 font-medium text-error-500">
          {t(`rejected.${rejected}`)}
        </p>
      ) : null}
    </div>
  );
}
