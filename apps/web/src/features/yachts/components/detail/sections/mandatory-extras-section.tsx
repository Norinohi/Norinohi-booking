"use client";

import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

export default function MandatoryExtrasSection() {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const formatMoney = useMoney();
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="mandatory-extras" title={t("sections.mandatoryExtras")}>
      <div className="flex flex-col">
        {data.mandatoryExtras.map((item) => (
          <div
            key={item.code}
            className="flex items-start gap-4 border-b border-dashed border-border pt-3 pb-2.75 md:gap-10 xl:gap-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-base leading-5.5 text-foreground">{item.label}</p>
              <p className="text-xs font-semibold text-natural-300">{tExtras("payAtCheckIn")}</p>
            </div>
            {/* The operator's own measure, where it gave one: a per-person extra quoted
                as "per booking" understates what the charter will be billed. */}
            <p className="shrink-0 text-right text-base leading-5.5 font-bold text-foreground max-md:max-w-18">
              {item.priceMeasure
                ? `${formatMoney(item.price.amountMinor)} ${item.priceMeasure}`
                : tExtras("perBooking", { price: formatMoney(item.price.amountMinor) })}
            </p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
