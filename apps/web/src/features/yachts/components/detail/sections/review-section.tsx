"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

const PER_PAGE = 5;

/*
 * The reviews on a yacht detail page.
 *
 * Two different populations feed this, and only one of them writes anything. `reviews` is our
 * own marketplace content; `rating`/`reviewCount` fall back to the provider's aggregate (NauSYS
 * ships Euminia scores) for a listing nobody has reviewed here — the read model coalesces them
 * and never averages the two.
 *
 * So an empty list next to a non-zero count is the normal state, not an error, and the header
 * must not pretend otherwise: the count belongs to the list under it, and the aggregate is
 * explained in the empty state instead. Rendering the count over nothing read as a broken page.
 */
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
          {/* A listing nobody has scored is not a listing scored zero. */}
          {data.rating > 0 ? (
            <Chip className="bg-transparent p-1.5 text-gold">
              <Star className="fill-current" />
              {data.rating}
            </Chip>
          ) : null}
          {reviews.length > 0 ? (
            <span className="text-xs font-semibold text-natural-300">
              {t("review.count", { count: reviews.length })}
            </span>
          ) : null}
        </>
      }
    >
      {reviews.length > 0 ? (
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

          {reviews.length > PER_PAGE ? (
            <PaginationControl
              className="py-4"
              page={page}
              onPageChange={setPage}
              total={reviews.length}
              pageSize={PER_PAGE}
              summary={(range) => t("review.summary", { shown: range.to, total: range.total })}
            />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1 py-2">
          <p className="text-base leading-5.5 font-bold text-foreground">{t("review.empty")}</p>
          {/* Only when there is an aggregate to account for, so the score never sits unexplained. */}
          {data.reviewCount > 0 ? (
            <p className="text-base leading-5.5 text-natural-600">
              {t("review.operatorRated", { count: data.reviewCount })}
            </p>
          ) : null}
        </div>
      )}
    </DetailSection>
  );
}
