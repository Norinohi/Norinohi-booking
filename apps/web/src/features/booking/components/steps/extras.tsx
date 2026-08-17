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

type OptionalExtra = NonNullable<
  ReturnType<typeof useBooking>["listing"]
>["optionalExtras"][number];

/** The label, note and price shared by a selectable extra and an arrange-at-base one. */
function ExtraRow({ item, note }: { item: OptionalExtra; note?: string }) {
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();
  const caption = note ?? (item.pricingType === "pay_at_check_in" ? tExtras("payAtCheckIn") : null);

  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base leading-[1.4] text-foreground">{item.label}</span>
        {caption === null ? null : (
          <span className="text-xs leading-[1.3] font-semibold text-natural-300">{caption}</span>
        )}
      </span>
      <span className="shrink-0 text-base leading-[1.4] font-bold text-foreground">
        {tExtras("perBooking", { price: money(item.price.amountMinor) })}
      </span>
    </>
  );
}

export default function ExtrasStep() {
  const t = useTranslations("Booking.extras");
  const { control } = useFormContext<BookingValues>();
  const { listing } = useBooking();

  const included = listing?.includedAmenities ?? [];
  const optional = listing?.optionalExtras ?? [];
  const selectable = optional.filter((item) => item.selectable);
  const arrangeAtBase = optional.filter((item) => !item.selectable);

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
              {selectable.map((item) => (
                <label
                  key={item.code}
                  className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border py-3"
                >
                  <Checkbox
                    checked={field.value.includes(item.code)}
                    onCheckedChange={(checked) => {
                      field.onChange(
                        checked
                          ? [...field.value, item.code]
                          : field.value.filter((code) => code !== item.code),
                      );
                    }}
                    onBlur={field.onBlur}
                  />
                  <ExtraRow item={item} />
                </label>
              ))}

              {/*
                Shown but not offered: the provider cannot price these on the quote, so a
                checkbox would take a choice and silently charge nothing for it. The customer
                still needs to know the extra exists and roughly what it costs.
              */}
              {arrangeAtBase.map((item) => (
                <div
                  key={item.code}
                  className="flex items-start gap-2 border-b border-dashed border-border py-3"
                >
                  {/* Keeps the label column aligned with the checkbox rows above. */}
                  <span aria-hidden className="size-4 shrink-0" />
                  <ExtraRow item={item} note={t("arrangeAtBase")} />
                </div>
              ))}
            </div>
          )}
        />
      </section>
    </>
  );
}
