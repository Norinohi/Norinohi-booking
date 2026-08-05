"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useMoney } from "@/hooks/use-money";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

export default function OptionalExtrasSection() {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const formatMoney = useMoney();
  const { data } = useListingDetail();
  const [selected, setSelected] = useState<string[]>([]);

  function toggleExtra(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((it) => it !== id)));
  }

  if (!data) return null;

  return (
    <DetailSection id="optional-extras" title={t("sections.optionalExtras")}>
      <div className="flex flex-col">
        {data.optionalExtras.map((item) => (
          <label
            key={item.code}
            className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border pt-3 pb-2.75"
          >
            <Checkbox
              checked={selected.includes(item.code)}
              onCheckedChange={(checked) => toggleExtra(item.code, checked)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-base leading-5.5 text-foreground">{item.label}</p>
              <p className="text-xs font-semibold text-natural-300">{tExtras("payAtCheckIn")}</p>
            </div>
            <p className="shrink-0 text-base font-bold text-foreground">
              {tExtras("perBooking", { price: formatMoney(item.price.amountMinor) })}
            </p>
          </label>
        ))}
      </div>
    </DetailSection>
  );
}
