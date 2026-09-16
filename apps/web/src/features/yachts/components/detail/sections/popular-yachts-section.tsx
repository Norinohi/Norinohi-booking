"use client";

import { placeLine } from "@yacht-charter/api/lib/place-line";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselSlide,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import {
  PaginationNext,
  PaginationPrevious,
} from "@yacht-charter/ui/components/navigation/pagination";
import { Anchor, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { useMoney } from "@/hooks/use-money";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import { crewLabel } from "@/lib/crew-label";
import { listingDetailHref } from "../../../lib/detail-href";
import DetailSection from "./detail-section";
import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";
import {
  toYachtTile,
  yachtCardListPrice,
  yachtCardPrice,
} from "@/components/shared/data-display/yacht-card/view-model";

function CarouselNav() {
  const t = useTranslations("YachtDetail");
  const { api, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <div className="flex shrink-0 items-center gap-3">
      <PaginationPrevious
        aria-label={t("popular.previous")}
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      />
      <PaginationNext
        aria-label={t("popular.next")}
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      />
    </div>
  );
}

export default function PopularYachtsSection() {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const formatMoney = useMoney();
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="popular-yachts" title={t("sections.popularYachts")}>
      <Carousel options={{ align: "start", containScroll: "trimSnaps" }} className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <CarouselNav />
          <Button
            variant="neutral"
            nativeButton={false}
            render={<Link href="/yachts" />}
            className="capitalize"
          >
            {t("popular.seeAll")}
          </Button>
        </div>

        <CarouselViewport>
          {data.popularYachts.map((yacht) => (
            <CarouselSlide key={yacht.id} className="basis-87.5 pr-4">
              <YachtCard
                layout="tile"
                className="w-full"
                {...toYachtTile(yacht, {
                  imageAlt: tCard("imageAlt", { name: yacht.title, marina: yacht.base.name }),
                  imageSizes: "334px",
                  location: placeLine(yacht.base.location, yacht.base.country),
                  detailHref: listingDetailHref(yacht),
                  tags: [
                    { label: yacht.category, icon: <Anchor /> },
                    ...(yacht.crewType
                      ? [{ label: crewLabel(tCrew, yacht.crewType), icon: <Users /> }]
                      : []),
                  ],
                  price: yachtCardPrice(tCard, yacht, formatMoney),
                  listPrice: yachtCardListPrice(yacht, formatMoney),
                  /* The charter this figure prices, not a share of it: the card prints the whole
                     advertised period, which was labelled "per person" against a number no
                     guest's share ever equalled. */
                  priceSuffix: t("popular.perPeriod", { days: yacht.priceDetails.periodDays }),
                  priceLabel: t("popular.from"),
                  actionLabel: tCard("viewDetails"),
                })}
              />
            </CarouselSlide>
          ))}
        </CarouselViewport>
      </Carousel>
    </DetailSection>
  );
}
