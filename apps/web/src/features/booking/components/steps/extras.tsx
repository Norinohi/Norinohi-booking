"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { useMoney } from "@/hooks/use-money";

import type { BookingValues } from "../../lib/booking-form";
import { useBooking } from "../booking-provider";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{children}</h3>;
}

export default function ExtrasStep() {
  const t = useTranslations("Booking.extras");
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();
  const { control } = useFormContext<BookingValues>();
  const { listing, setExtras } = useBooking();

  const included = listing?.includedAmenities ?? [];
  const optional = listing?.optionalExtras ?? [];

  return (
    <>
      <section className="flex flex-col p-5">
        <SectionTitle>{t("mandatory")}</SectionTitle>

        {/* Two-up from md, where the column gap also widens. The dashed rule closes the last
            row only when paired — stacked, the design keeps it under every item. */}
        <ul className="grid md:grid-cols-2 md:gap-x-6 xl:gap-x-10">
          {included.map((item) => (
            <li
              key={item.code}
              className="flex items-center gap-2 border-b border-dashed border-border py-3 md:last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
            >
              <span className="min-w-0 flex-1 text-base leading-[1.4] text-foreground">
                {item.label}
              </span>
              <span className="flex shrink-0 items-center gap-2 py-1">
                <CircleCheckBig className="size-5 text-brand" />
                <span className="text-base leading-[1.4] font-bold text-foreground">
                  {t("included")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <span aria-hidden className="block h-px w-full bg-border" />

      <section className="flex flex-col p-5">
        <SectionTitle>{t("optional")}</SectionTitle>

        <Controller
          control={control}
          name="extras.optional"
          render={({ field }) => (
            <div className="flex flex-col">
              {optional.map((item) => (
                <label
                  key={item.code}
                  className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border py-3"
                >
                  <Checkbox
                    checked={field.value.includes(item.code)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...field.value, item.code]
                        : field.value.filter((code) => code !== item.code);
                      field.onChange(next);
                      /* Repricing here is what makes the sidebar and Review reflect the pick. */
                      setExtras(next);
                    }}
                    onBlur={field.onBlur}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base leading-[1.4] text-foreground">{item.label}</span>
                    {item.pricingType === "pay_at_check_in" ? (
                      <span className="text-xs leading-[1.3] font-semibold text-natural-300">
                        {tExtras("payAtCheckIn")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-base leading-[1.4] font-bold text-foreground">
                    {tExtras("perBooking", { price: money(item.price.amountMinor) })}
                  </span>
                </label>
              ))}
            </div>
          )}
        />
      </section>
    </>
  );
}
