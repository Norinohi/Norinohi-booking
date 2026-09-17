"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { Calendar, Info } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { useExactMoney } from "@/hooks/use-money";
import { dayToDisplay } from "@/lib/date";

import type { Quote, QuoteLine } from "../../api/queries";
import { useQuoteLineLabel } from "../../hooks/use-quote-line-label";

/** Payment-schedule `kind` → the amount-caption message on `sidebar.*`. */
const SCHEDULE_AMOUNT_KEY = {
  deposit: "firstPayment",
  /* Its own caption, not the deposit's: a policy that takes the whole charter up front produces
     exactly one payment, and calling it the first promises a second that never arrives. */
  full: "fullPayment",
  balance: "secondPayment",
  checkin_extras: "extrasPayment",
  security_deposit: "depositNote",
} as const satisfies Record<Quote["paymentSchedule"][number]["kind"], string>;

const NBSP = " ";

type ScheduleEntry = Quote["paymentSchedule"][number];

export interface ScheduleBreakdownProps {
  entry: ScheduleEntry;
  lines: QuoteLine[];
}

/*
 * What one instalment is made of, read off the quote lines by when each is collected, so the
 * breakdown adds up to the figure beside it. A split prepayment has no per-line allocation, so
 * both halves list the whole set and say so rather than inventing one.
 */
export function ScheduleBreakdown({ entry, lines }: ScheduleBreakdownProps) {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const money = useExactMoney();
  const labelOf = useQuoteLineLabel();
  const [open, setOpen] = useState(false);

  let content: ReactNode;
  if (entry.kind === "security_deposit") {
    content = tCard("securityDepositInfo");
  } else {
    const payWhen = entry.kind === "checkin_extras" ? "at_check_in" : "now";
    const covered = lines.filter(
      (line) => line.payWhen === payWhen && line.amount.amountMinor !== 0,
    );
    if (covered.length === 0) return null;
    content = (
      <div className="flex flex-col gap-2">
        <p className="text-natural-500">
          {t(
            entry.kind === "deposit" || entry.kind === "balance"
              ? "sidebar.scheduleSplit"
              : "sidebar.scheduleIncludes",
          )}
        </p>
        {covered.map((line) => (
          <div key={line.code} className="flex items-start gap-3">
            <span className="min-w-0 flex-1">{labelOf(line)}</span>
            <span className="shrink-0 font-semibold">
              {money(line.amount.amountMinor, line.amount.currency)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  /* Opened on click as well as hover: a phone has no hover, and this is where most of it is read. */
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={t("sidebar.scheduleDetails")}
            onClick={() => setOpen(true)}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        }
      >
        <Info className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{content}</TooltipContent>
    </Tooltip>
  );
}

export interface PaymentScheduleProps {
  entries: Quote["paymentSchedule"];
  lines: QuoteLine[];
}

export function PaymentSchedule({ entries, lines }: PaymentScheduleProps) {
  const t = useTranslations("YachtDetail");
  const format = useFormatter();
  const money = useExactMoney();

  const when = (entry: Quote["paymentSchedule"][number]) => {
    if (!entry.dueAt) return t("sidebar.payNow");
    /* Non-breaking inside the date, so a narrow column wraps before it rather than through
       it — otherwise the Ukrainian "р." lands alone on a line of its own. */
    const date = format.dateTime(dayToDisplay(entry.dueAt), "dayShort").replaceAll(" ", NBSP);
    return entry.kind === "checkin_extras" || entry.kind === "security_deposit"
      ? t("sidebar.payAtCheckIn", { date })
      : t("sidebar.payAt", { date });
  };

  return (
    <div className="flex gap-3 px-4 py-4">
      <div className="relative flex w-4 shrink-0 justify-center">
        <span aria-hidden className="absolute inset-y-2 border-l-4 border-dotted border-border" />
        <span aria-hidden className="relative h-8 w-1 shrink-0 rounded-full bg-foreground" />
      </div>

      <ol className="flex min-w-0 flex-1 flex-col gap-12">
        {entries.map((entry) => (
          <li key={entry.kind} className="flex flex-col gap-1">
            <Chip className="gap-1 bg-transparent p-0 text-sm leading-4.5 font-medium text-natural-500">
              {entry.dueAt ? <Calendar className="shrink-0" /> : null}
              {when(entry)}
            </Chip>
            <div className="flex items-start gap-1.5">
              <p className="text-base leading-5.5 font-bold text-foreground">
                {t(`sidebar.${SCHEDULE_AMOUNT_KEY[entry.kind]}`, {
                  amount: money(entry.amount.amountMinor, entry.amount.currency),
                })}
              </p>
              <ScheduleBreakdown entry={entry} lines={lines} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
