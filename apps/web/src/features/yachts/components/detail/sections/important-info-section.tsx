"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/data-display/image";
import { staticMapUrl } from "@/lib/mapbox";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import { slugToLabel } from "@/lib/slug-to-label";
import DetailSection from "./detail-section";

type RowKey =
  | "charterCompany"
  | "pickUpAddress"
  | "pickUp"
  | "dropOff"
  | "policies"
  | "license"
  | "pets"
  | "paymentMethods"
  | "marinaInfo";

type Row = {
  key: RowKey;
  value: string;
  note?: string;
  mapPoint?: { lat: number; lng: number };
};

export default function ImportantInfoSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  const info = data.importantInformation;
  const rows: Row[] = [
    { key: "charterCompany", value: info.charterCompany },
    { key: "pickUpAddress", value: info.yachtPickupAddress, mapPoint: info.map },
    { key: "pickUp", value: info.yachtPickup.date ?? "", note: info.yachtPickup.time ?? undefined },
    {
      key: "dropOff",
      value: info.yachtDropOff.date ?? "",
      note: info.yachtDropOff.time ?? undefined,
    },
    { key: "policies", value: info.cancellationPaymentPolicies },
    { key: "license", value: info.sailingLicenseRequired },
    { key: "pets", value: info.pets },
    {
      key: "paymentMethods",
      value: info.paymentMethodsAcceptedByCharterCompany.map(slugToLabel).join(", "),
    },
    { key: "marinaInfo", value: info.marinaInformation },
  ];

  return (
    <DetailSection id="important-info" title={t("sections.importantInfo")}>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex gap-4 border-b border-dashed border-border md:gap-10",
              row.mapPoint ? "items-start" : "items-center",
            )}
          >
            <dt
              className={cn(
                "min-w-0 flex-1 text-base font-bold leading-5.5 text-foreground",
                row.mapPoint ? "pt-3" : "pt-3 pb-2.75",
              )}
            >
              {t(`importantInfo.${row.key}`)}
            </dt>
            <dd className="flex min-w-0 flex-1 flex-col gap-3 pt-3 pb-2.75">
              <div className="flex flex-col gap-1">
                <p className={cn("text-base leading-5.5 text-foreground", row.note && "font-bold")}>
                  {row.value}
                </p>
                {row.note ? (
                  <p className="text-sm leading-4.5 tracking-wider uppercase text-natural-500">
                    {row.note}
                  </p>
                ) : null}
              </div>
              {row.mapPoint ? (
                <div className="relative h-37 w-full overflow-hidden rounded-2xl md:h-59">
                  <Image
                    unoptimized
                    src={staticMapUrl(row.mapPoint, { zoom: 9, size: "500x236@2x" })}
                    alt=""
                    fill
                    sizes="501px"
                    className="object-cover"
                  />
                  <span aria-hidden className="absolute inset-0 bg-black/40" />
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-1/2 flex size-21 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25"
                  >
                    <MapPin className="size-6 fill-brand text-white" />
                  </span>
                </div>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}
