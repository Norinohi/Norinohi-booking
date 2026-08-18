"use client";

import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * Per-listing questions. No provider publishes these, so the table is empty for the whole
 * imported fleet and the section is hidden rather than rendering a heading over nothing.
 * `DetailTabs` drops its tab on the same condition — a tab that scrolls nowhere is worse
 * than one that is absent.
 */
export default function FaqSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data || data.faq.length === 0) return null;

  return (
    <DetailSection id="faq" title={t("sections.faq")}>
      <dl className="flex flex-col gap-3">
        {data.faq.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 border-b border-dashed border-border pb-2.75"
          >
            <dt className="text-base leading-5.5 font-bold text-foreground">{item.question}</dt>
            <dd className="text-base leading-5.5 text-natural-600">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}
