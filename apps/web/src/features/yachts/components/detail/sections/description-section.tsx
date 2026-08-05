"use client";

import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

export default function DescriptionSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="description" title={t("sections.description")}>
      <p className="text-xl whitespace-pre-line text-foreground">{data.description}</p>
    </DetailSection>
  );
}
