"use client";

import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * `description` is the server's copy: the provider's prose when it ships any in this locale, and
 * generated sentences otherwise. The client read is only the newer of the two once the cache
 * refreshes, so it wins when present and the prop covers the first paint.
 */
export default function DescriptionSection({ description }: { description?: string }) {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  const body = data?.description ?? description;
  if (!body) return null;

  return (
    <DetailSection id="description" title={t("sections.description")}>
      <p className="text-xl whitespace-pre-line text-foreground">{body}</p>
    </DetailSection>
  );
}
