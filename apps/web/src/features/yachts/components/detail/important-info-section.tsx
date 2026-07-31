import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/image";

import DetailSection from "./detail-section";

const ROWS = [
  { key: "charterCompany", value: "Ambassador Travel" },
  { key: "pickUpAddress", value: "ACI Marina Split, Split, Croatia", map: true },
  { key: "pickUp", value: "7 July, 2026", note: "17:00" },
  { key: "dropOff", value: "14 July, 2026", note: "19:00" },
  {
    key: "policies",
    value:
      "Cancellation and prepayment policies vary according to your selection. Please check the payment conditions when selecting the price above. Check price",
  },
  { key: "license", value: "No license is needed" },
  { key: "pets", value: "Pets are not permitted on this boat." },
  { key: "paymentMethods", value: "Cash" },
  {
    key: "marinaInfo",
    value:
      "Marina Split is situated nearby Split, Croatia. It is located 14.9 miles from the nearest airport and 0.6 miles from Split city center. It also offers a restaurant.",
  },
] as const;

export default function ImportantInfoSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="important-info" title={t("sections.importantInfo")}>
      <dl className="flex flex-col">
        {ROWS.map((row) => {
          const hasMap = "map" in row;
          const note = "note" in row ? row.note : undefined;

          return (
            <div
              key={row.key}
              className={cn(
                "flex gap-4 border-b border-dashed border-border md:gap-10",
                hasMap ? "items-start" : "items-center",
              )}
            >
              <dt
                className={cn(
                  "min-w-0 flex-1 text-base font-bold leading-5.5 text-foreground",
                  hasMap ? "pt-3" : "pt-3 pb-2.75",
                )}
              >
                {t(`importantInfo.${row.key}`)}
              </dt>
              <dd className="flex min-w-0 flex-1 flex-col gap-3 pt-3 pb-2.75">
                <div className="flex flex-col gap-1">
                  <p className={cn("text-base leading-5.5 text-foreground", note && "font-bold")}>
                    {row.value}
                  </p>
                  {note ? (
                    <p className="text-sm leading-4.5 tracking-wider uppercase text-natural-500">
                      {note}
                    </p>
                  ) : null}
                </div>
                {hasMap ? (
                  <Image
                    src="/assets/yachts/marina-map.png"
                    alt=""
                    width={501}
                    height={236}
                    sizes="501px"
                    className="h-37 w-full rounded-2xl object-cover md:h-59"
                  />
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </DetailSection>
  );
}
