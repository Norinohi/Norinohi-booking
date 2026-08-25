"use client";

import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

type FaqEntry = NonNullable<ReturnType<typeof useListingDetail>["data"]>["faq"][number];

type FaqGroup = { category: FaqEntry["category"]; items: FaqEntry[] };

/**
 * Consecutive runs, not a lookup table: the server already returns the entries in the order
 * they belong on the page, so folding neighbours preserves that order instead of imposing a
 * second one here that could disagree with it.
 */
function groupByCategory(entries: readonly FaqEntry[]): FaqGroup[] {
  const groups: FaqGroup[] = [];

  for (const item of entries) {
    const current = groups.at(-1);
    if (current && current.category === item.category) current.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }

  return groups;
}

/**
 * The site-wide FAQ the client wrote, grouped the way they grouped it, preceded by whatever
 * questions this listing carries of its own. A listing's entries have no category and render
 * without a heading; the six categories are the site-wide taxonomy.
 *
 * The section is hidden when there is nothing to show rather than rendering a heading over
 * nothing, and the server drops an entry whose answer has not been written yet, so an
 * unanswered question never reaches here. `DetailTabs` drops its tab on the same condition.
 */
export default function FaqSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data || data.faq.length === 0) return null;

  return (
    <DetailSection id="faq" title={t("sections.faq")}>
      <div className="flex flex-col gap-6">
        {groupByCategory(data.faq).map((group) => (
          <div key={group.category ?? "listing"} className="flex flex-col gap-3">
            {group.category ? (
              <h3 className="text-lg leading-6 font-bold text-foreground">
                {t(`faqCategories.${group.category}`)}
              </h3>
            ) : null}

            <dl className="flex flex-col gap-3">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 border-b border-dashed border-border pb-2.75"
                >
                  <dt className="text-base leading-5.5 font-bold text-foreground">
                    {item.question}
                  </dt>
                  <dd className="text-base leading-5.5 text-natural-600">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
