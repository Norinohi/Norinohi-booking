"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import DetailSection from "./detail-section";

const RATING = "5";
const TOTAL = 14;
const PER_PAGE = 5;

const REVIEWS = [
  {
    name: "Elias Rossi",
    rating: 4,
    text: "The perfect yacht for our family vacation. The kids loved the spacious layout and we felt safe at all times.*",
  },
  {
    name: "Kenji Tanaka",
    rating: 3,
    text: "Island hopping was a breeze with this yacht. We explored so many beautiful islands and the flexible routes made it easy to customize our trip.*",
  },
  {
    name: "Ava Dubois",
    rating: 4,
    text: "We had an amazing time with our friends on this yacht. Plenty of space for everyone and the shared cabins were perfect for socializing.*",
  },
  {
    name: "Ingrid Bjornstad",
    rating: 5,
    text: "Relaxed sailing at its finest! The calm waters and easy navigation made for a stress-free and enjoyable experience.",
  },
] as const;

export default function ReviewSection() {
  const t = useTranslations("YachtDetail");
  const [page, setPage] = useState(1);

  return (
    <DetailSection
      id="review"
      title={
        <>
          {t("sections.review")}
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            {RATING}
          </Chip>
          <span className="text-xs font-semibold text-natural-300">
            {t("review.count", { count: 128 })}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {REVIEWS.map((review) => (
          <article
            key={review.name}
            className="flex flex-col gap-2 border-b border-dashed border-border pb-2.75"
          >
            <div className="flex items-center gap-1.5 text-sm leading-4 font-semibold text-gold">
              {Array.from({ length: review.rating }, (_, index) => (
                <Star key={index} className="size-4 shrink-0 fill-current" />
              ))}
              {review.rating}
            </div>
            <p className="text-base leading-5.5 font-bold text-foreground">{review.name}</p>
            <p className="text-base leading-5.5 text-natural-600">{review.text}</p>
          </article>
        ))}

        <PaginationControl
          className="py-4"
          page={page}
          onPageChange={setPage}
          total={TOTAL}
          pageSize={PER_PAGE}
          summary={(range) => t("review.summary", { shown: range.to, total: range.total })}
        />
      </div>
    </DetailSection>
  );
}
