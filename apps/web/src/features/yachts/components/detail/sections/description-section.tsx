import { useTranslations } from "next-intl";

import DetailSection from "./detail-section";

const DESCRIPTION = `Experience the ultimate in luxury aboard the Lagoon 42!
This stunning catamaran boasts 4 double cabins and 4 bathrooms, comfortably accommodating up to 10 guests. Socialize in style with spacious living areas and breathtaking views. Built in 2022 and equipped with a robust 2,544 hp engine, the Lagoon 42 promises an unforgettable sailing experience.`;

export default function DescriptionSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="description" title={t("sections.description")}>
      <p className="text-xl whitespace-pre-line text-foreground">{DESCRIPTION}</p>
    </DetailSection>
  );
}
