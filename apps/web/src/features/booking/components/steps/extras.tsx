"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import type { BookingValues } from "../../lib/booking-form";

/* TODO: placeholder catalogue until the listing carries its own extras. The names stand in
 * for provider content, so they live here rather than in the message files. Rendered two-up,
 * so the order reads across rows. */
const INCLUDED = [
  "Air conditioning",
  "Free Wi-Fi",
  "Fully equipped kitchen",
  "Bluetooth sound system",
  "Sun deck with loungers",
  "Swim platform",
  "Outdoor dining area",
  "Fresh water system",
];

/** Read by the Review step to name the picks. */
export const OPTIONAL = [
  { id: "sunbathing", name: "Spacious sunbathing area", price: "€100" },
  { id: "bbq", name: "Gas BBQ", price: "€200" },
  { id: "wet-bar", name: "Fully stocked wet bar", price: "€150" },
  { id: "navigation", name: "Advanced navigation system", price: "€300" },
  { id: "underwater-lights", name: "Multi-color underwater lights", price: "€120" },
  { id: "hot-tub", name: "Hot tub", price: "€100" },
];

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{children}</h3>;
}

export default function ExtrasStep() {
  const t = useTranslations("Booking.extras");
  const tExtras = useTranslations("Common.extras");
  const { control } = useFormContext<BookingValues>();

  return (
    <>
      <section className="flex flex-col p-5">
        <SectionTitle>{t("mandatory")}</SectionTitle>

        {/* Two-up from md, where the column gap also widens. The dashed rule closes the last
            row only when paired — stacked, the design keeps it under every item. */}
        <ul className="grid md:grid-cols-2 md:gap-x-6 xl:gap-x-10">
          {INCLUDED.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 border-b border-dashed border-border py-3 md:last:border-b-0 md:[&:nth-last-child(2)]:border-b-0"
            >
              <span className="min-w-0 flex-1 text-base leading-[1.4] text-foreground">{name}</span>
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
              {OPTIONAL.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border py-3"
                >
                  <Checkbox
                    checked={field.value.includes(item.id)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked
                          ? [...field.value, item.id]
                          : field.value.filter((id) => id !== item.id),
                      )
                    }
                    onBlur={field.onBlur}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base leading-[1.4] text-foreground">{item.name}</span>
                    <span className="text-xs leading-[1.3] font-semibold text-natural-300">
                      {tExtras("payAtCheckIn")}
                    </span>
                  </span>
                  <span className="shrink-0 text-base leading-[1.4] font-bold text-foreground">
                    {tExtras("perBooking", { price: item.price })}
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
