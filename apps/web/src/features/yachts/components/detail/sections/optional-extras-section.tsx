"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { useTranslations } from "next-intl";
import { useState } from "react";

import DetailSection from "./detail-section";

const OPTIONAL = [
  { id: "sunbathing", name: "Spacious sunbathing area", price: "€100" },
  { id: "bbq", name: "Gas BBQ", price: "€200" },
  { id: "wet-bar", name: "Fully stocked wet bar", price: "€150" },
  { id: "navigation", name: "Advanced navigation system", price: "€300" },
  { id: "underwater-lights", name: "Multi-color underwater lights", price: "€120" },
  { id: "hot-tub", name: "Hot tub", price: "€100" },
] as const;

export default function OptionalExtrasSection() {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const [selected, setSelected] = useState<string[]>(["sunbathing"]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((it) => it !== id)));
  }

  return (
    <DetailSection id="optional-extras" title={t("sections.optionalExtras")}>
      <div className="flex flex-col">
        {OPTIONAL.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border pt-3 pb-2.75"
          >
            <Checkbox
              checked={selected.includes(item.id)}
              onCheckedChange={(checked) => toggle(item.id, checked)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-base leading-5.5 text-foreground">{item.name}</p>
              <p className="text-xs font-semibold text-natural-300">{tExtras("payAtCheckIn")}</p>
            </div>
            <p className="shrink-0 text-base font-bold text-foreground">
              {tExtras("perBooking", { price: item.price })}
            </p>
          </label>
        ))}
      </div>
    </DetailSection>
  );
}
