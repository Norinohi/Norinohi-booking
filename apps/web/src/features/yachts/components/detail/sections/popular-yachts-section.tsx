"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
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

import { WishlistButton } from "@/features/wishlist";
import { useMoney } from "@/hooks/use-money";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import { slugToLabel } from "../../../lib/slug-to-label";
import DetailSection from "./detail-section";

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
              <BoatSmallCard
                className="w-full"
                image={yacht.mainImage}
                imageAlt={tCard("imageAlt", { name: yacht.title, marina: yacht.base.name })}
                location={`${yacht.base.location}, ${yacht.base.country}`}
                title={yacht.title}
                rating={yacht.rating}
                tags={[
                  { label: yacht.category, icon: <Anchor /> },
                  ...(yacht.crewType
                    ? [{ label: slugToLabel(yacht.crewType), icon: <Users /> }]
                    : []),
                ]}
                price={formatMoney(yacht.priceFrom.amountMinor)}
                priceSuffix={t("popular.perPerson")}
                priceLabel={t("popular.from")}
                actionLabel={tCard("viewDetails")}
                actionRender={<Link href={`/yachts/${yacht.slug}`} />}
                saveRender={<WishlistButton listingId={yacht.id} />}
              />
            </CarouselSlide>
          ))}
        </CarouselViewport>
      </Carousel>
    </DetailSection>
  );
}
