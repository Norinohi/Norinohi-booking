"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import type { BookingValues } from "../../lib/booking-form";
import { OPTIONAL } from "./extras";

/* TODO: placeholder charter until the quote endpoint lands. Mirrors the Figma copy, which
 * quotes a shorter stay than the sidebar — both are mock numbers, not a calculation. */
const BOOKING = {
  yacht: 'Lagoon 42 "Jupiter One"',
  dates: "7 – 14 July, 2026",
  crew: "Full",
  people: "6 people",
  boatPrice: "€10,000",
  deposit: "€2,000",
  secondPayment: "€5,000",
  secondPaymentDate: "31.06.2026",
  total: "€12,500",
  perPerson: "€3,500",
  dueNow: "€5,000",
};

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
  const { control } = useFormContext<BookingValues>();

  /* The one live value on this screen: whatever step 2 left selected. */
  const selected = useWatch({ control, name: "extras.optional" });
  const extras = OPTIONAL.filter((item) => selected.includes(item.id))
    .map((item) => item.name)
    .join(", ");

  const rows: SummaryRow[] = [
    { label: t("yacht"), value: BOOKING.yacht },
    { label: t("dates"), value: BOOKING.dates },
    { label: t("crew"), value: BOOKING.crew },
    { label: t("people"), value: BOOKING.people },
    { label: t("extras"), value: extras || t("noExtras") },
    { label: t("boatPrice"), value: BOOKING.boatPrice },
    { label: t("deposit"), value: BOOKING.deposit },
    {
      label: t("secondPayment", { date: BOOKING.secondPaymentDate }),
      value: BOOKING.secondPayment,
    },
    {
      label: t("totalPrice"),
      value: BOOKING.total,
      note: tCard("perPersonApprox", { price: BOOKING.perPerson }),
      strong: true,
    },
    { label: t("dueNow"), value: BOOKING.dueNow, strong: true },
  ];

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
