"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { MarinaDetails } from "@/components/shared/overlay/marina-popover";
import MapPreview from "@/components/shared/overlay/map-preview";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import { toMarina } from "../../../lib/to-marina";
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

/* The read model answers which sentence applies; the sentences themselves are here. */
const POLICY_KEY = {
  varies_by_selection: "policiesVariesBySelection",
  required: "licenseRequired",
  not_required: "licenseNotRequired",
  allowed_with_confirmation: "petsAllowedWithConfirmation",
  ask_base: "petsAskBase",
} as const;

const PAYMENT_METHOD_KEY = new Map<string, "card" | "bank_transfer" | "cash">([
  ["card", "card"],
  ["bank_transfer", "bank_transfer"],
  ["cash", "cash"],
]);

type Row = {
  key: RowKey;
  value: string;
  note?: string;
  mapPoint?: { lat: number; lng: number };
};

export default function ImportantInfoSection() {
  const t = useTranslations("YachtDetail");
  const tInfo = useTranslations("YachtDetail.importantInfo");
  const tMethod = useTranslations("YachtDetail.importantInfo.paymentMethod");
  const { data } = useListingDetail();

  if (!data) return null;

  const info = data.importantInformation;
  /* The pin here marks the same marina the popover does, so tapping it says the same thing. */
  const marina = toMarina(data.base);
  const rows: Row[] = [
    { key: "charterCompany", value: info.charterCompany },
    { key: "pickUpAddress", value: info.yachtPickupAddress, mapPoint: info.map },
    { key: "pickUp", value: info.yachtPickup.time ?? "" },
    { key: "dropOff", value: info.yachtDropOff.time ?? "" },
    { key: "policies", value: tInfo(POLICY_KEY[info.cancellationPaymentPolicies]) },
    { key: "license", value: tInfo(POLICY_KEY[info.sailingLicenseRequired]) },
    { key: "pets", value: tInfo(POLICY_KEY[info.pets]) },
    {
      key: "paymentMethods",
      /* A method the messages do not name still shows, spelled out of its slug rather than
         dropped: an unlisted way to pay is not the same as no way to pay. */
      value: info.paymentMethodsAcceptedByCharterCompany
        .map((method) => {
          const key = PAYMENT_METHOD_KEY.get(method);
          return key ? tMethod(key) : slugToLabel(method);
        })
        .join(", "),
    },
    { key: "marinaInfo", value: tInfo("marinaInfoText", info.marinaInformation) },
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
                <MapPreview
                  point={row.mapPoint}
                  title={row.value}
                  zoom={9}
                  imageSize="500x236@2x"
                  imageSizes="501px"
                  className="h-37 w-full rounded-2xl md:h-59"
                  popup={<MarinaDetails marina={marina} className="w-72 rounded-2xl bg-card p-4" />}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}
