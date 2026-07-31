import { useTranslations } from "next-intl";

import DetailSection from "./detail-section";

const MANDATORY = [
  { name: "Cleaning fee", price: "€100" },
  {
    name: "Transit log",
    price: "€400",
    description:
      "Experience seamless access to the sea with our retractable swim platform, making swimming and water sports effortless",
  },
  { name: "Harbor & marina fees", price: "€150" },
] as const;

export default function MandatoryExtrasSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="mandatory-extras" title={t("sections.mandatoryExtras")}>
      <div className="flex flex-col">
        {MANDATORY.map((item) => (
          <div
            key={item.name}
            className="flex items-start gap-4 border-b border-dashed border-border pt-3 pb-2.75 md:gap-10 xl:gap-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-base leading-5.5 text-foreground">{item.name}</p>
              {"description" in item ? (
                <p className="text-sm font-medium leading-4.5 text-natural-500">
                  {item.description}
                </p>
              ) : null}
              <p className="text-xs font-semibold text-natural-300">{t("extras.payAtCheckIn")}</p>
            </div>
            {/* The price wraps to two lines in its 72px mobile column, which is what leaves the
                description the 270px the design gives it. */}
            <p className="shrink-0 text-right text-base leading-5.5 font-bold text-foreground max-md:max-w-18">
              {t("extras.perBooking", { price: item.price })}
            </p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
