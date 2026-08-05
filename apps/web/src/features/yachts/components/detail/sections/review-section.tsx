"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

const PER_PAGE = 5;

export default function ReviewSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();
  const [page, setPage] = useState(1);

  if (!data) return null;

  const reviews = data.reviews;
  const shown = reviews.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <DetailSection
      id="review"
      title={
        <>
          {t("sections.review")}
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            {data.rating}
          </Chip>
          <span className="text-xs font-semibold text-natural-300">
            {t("review.count", { count: data.reviewCount })}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {shown.map((review) => (
          <article
            key={review.id}
            className="flex flex-col gap-2 border-b border-dashed border-border pb-2.75"
          >
            <div className="flex items-center gap-1.5 text-sm leading-4 font-semibold text-gold">
              {Array.from({ length: Math.round(review.rating) }, (_, index) => (
                <Star key={index} className="size-4 shrink-0 fill-current" />
              ))}
              {review.rating}
            </div>
            <p className="text-base leading-5.5 font-bold text-foreground">{review.author}</p>
            <p className="text-base leading-5.5 text-natural-600">{review.body}</p>
          </article>
        ))}

        <PaginationControl
          className="py-4"
          page={page}
          onPageChange={setPage}
          total={reviews.length}
          pageSize={PER_PAGE}
          summary={(range) => t("review.summary", { shown: range.to, total: range.total })}
        />
      </div>
    </DetailSection>
  );
}
