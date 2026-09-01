"use client";

import { useTranslations } from "next-intl";

import { useExtraPrice } from "@/hooks/use-extra-price";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

export default function MandatoryExtrasSection() {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const extraPrice = useExtraPrice();
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="mandatory-extras" title={t("sections.mandatoryExtras")}>
      <div className="flex flex-col">
        {data.mandatoryExtras.map((item) => {
          /*
           * Named, never priced.
           *
           * Two ways an operator says the charter already covers this. It can type the service
           * INCLUDED_IN_PRICE, where the vendor keeps sending a list value the quote then
           * charges nothing for; or it can simply file the obligatory line at zero, which is
           * how 12,029 of them arrive -- "Outboard engine GRATIS", "End cleaning included in
           * the price", "4 crew: 1 captain, 1 cook and 2 deckhands". Both read as "included",
           * and both used to print "EUR 0 per booking" under a "Pay at check-in" caption, which
           * names a payment nobody will ever make.
           */
          const included =
            item.percentage === null &&
            (item.pricingType === "included" || item.price.amountMinor === 0);

          return (
            <div
              key={item.code}
              className="flex items-start gap-4 border-b border-dashed border-border pt-3 pb-2.75 md:gap-10 xl:gap-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-base leading-5.5 text-foreground">{item.label}</p>
                {/* Silent where the provider never said where it collects; the line used to
                    claim "Pay at check-in" for every fee, including ones the sidebar was
                    counting into the prepayment on the same screen. A route-conditional fee
                    says so instead: it is not charged on the same-base charter most of these
                    listings sell, so presenting it flatly overstates the trip. */}
                {!included && (item.oneWayOnly || item.payableInBase !== null) && (
                  <p className="text-xs font-semibold text-natural-300">
                    {item.oneWayOnly
                      ? tExtras("oneWayOnly")
                      : tExtras(item.payableInBase ? "payAtCheckIn" : "payNow")}
                  </p>
                )}
              </div>
              {/* The operator's own measure, where it gave one: a per-person extra quoted
                  as "per booking" understates what the charter will be billed. */}
              <p className="shrink-0 text-right text-base leading-5.5 font-bold text-foreground max-md:max-w-18">
                {item.percentage !== null
                  ? tExtras("percentageOfCharter", { percent: item.percentage * 100 })
                  : included
                    ? tExtras("includedInPrice")
                    : extraPrice(
                        item.price.amountMinor,
                        item.priceMeasure,
                        item.priceToMinor,
                        item.price.currency,
                      )}
              </p>
            </div>
          );
        })}
      </div>
    </DetailSection>
  );
}
