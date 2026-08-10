"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { useMoney } from "@/hooks/use-money";
import { dayToDisplay } from "@/lib/date";

import type { BookingValues } from "../../lib/booking-form";
import { useBooking } from "../booking-provider";

const CONSENTS = ["terms", "cancellation"] as const;

type SummaryRow = { label: string; value: ReactNode; note?: string; strong?: boolean };

function Row({ row, last }: { row: SummaryRow; last: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-dashed border-border xl:gap-10",
        last && "border-b-0",
      )}
    >
      <dt className="min-w-0 flex-1 text-base leading-[1.4] font-bold text-foreground">
        {row.label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 flex-1 py-3",
          row.strong ? "flex-col md:flex-row md:items-center md:gap-2" : "items-start",
        )}
      >
        {row.strong ? (
          <>
            <span className="text-xl leading-[1.3] font-bold text-foreground">{row.value}</span>
            {row.note ? (
              <span className="text-sm leading-[1.3] font-medium text-natural-500">{row.note}</span>
            ) : null}
          </>
        ) : (
          <span className="text-base leading-[1.4] text-natural-600">{row.value}</span>
        )}
      </dd>
    </div>
  );
}

export default function ReviewAndBookStep() {
  const t = useTranslations("Booking.review");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const money = useMoney();
  const format = useFormatter();
  const { control } = useFormContext<BookingValues>();
  const { listing, quote } = useBooking();

  const day = (date: string) => format.dateTime(dayToDisplay(date), "dayShort");

  const base = quote?.lines.find((line) => line.kind === "base");
  const optionalNames = (quote?.lines ?? [])
    .filter((line) => line.group === "optional")
    .map((line) => line.label)
    .join(", ");
  const balance = quote?.paymentSchedule.find((entry) => entry.kind === "balance");

  const rows: SummaryRow[] = quote
    ? [
        { label: t("yacht"), value: listing?.title ?? "" },
        { label: t("dates"), value: `${day(quote.checkIn)} → ${day(quote.checkOut)}` },
        { label: t("crew"), value: quote.crewType ? tCrew(quote.crewType) : "" },
        { label: t("people"), value: String(quote.guests) },
        { label: t("extras"), value: optionalNames || t("noExtras") },
        { label: t("boatPrice"), value: money((base ?? quote.lines[0])?.amount.amountMinor ?? 0) },
        ...(quote.securityDeposit
          ? [{ label: t("deposit"), value: money(quote.securityDeposit.amountMinor) }]
          : []),
        ...(balance
          ? [
              {
                label: t("secondPayment", { date: balance.dueAt ? day(balance.dueAt) : "" }),
                value: money(balance.amount.amountMinor),
              },
            ]
          : []),
        {
          label: t("totalPrice"),
          value: money(quote.total.amountMinor),
          note: quote.perPerson
            ? tCard("perPersonApprox", { price: money(quote.perPerson.amountMinor) })
            : undefined,
          strong: true,
        },
        { label: t("dueNow"), value: money(quote.deposit.amountMinor), strong: true },
      ]
    : [];

  return (
    <>
      <section className="flex flex-col p-5">
        <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h3>

        <dl className="flex flex-col">
          {rows.map((row, index) => (
            <Row key={row.label} row={row} last={index === rows.length - 1} />
          ))}
        </dl>
      </section>

      <span aria-hidden className="block h-px w-full bg-border" />

      <section className="flex flex-col gap-4 p-5">
        {CONSENTS.map((consent) => (
          <Controller
            key={consent}
            control={control}
            name={`reviewAndBook.${consent}`}
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.error ? true : undefined}
                  />
                  <span className="min-w-0 flex-1 text-base leading-[1.4] text-foreground">
                    {t.rich(consent, { b: (chunks) => <b className="font-bold">{chunks}</b> })}
                  </span>
                </label>
                {fieldState.error ? (
                  <p className="pl-8 text-xs leading-[1.2] tracking-[0.02em] text-error-500">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </div>
            )}
          />
        ))}
      </section>
    </>
  );
}
