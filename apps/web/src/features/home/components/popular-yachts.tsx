"use client";

import { placeLine } from "@yacht-charter/api/lib/place-line";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselNav,
  CarouselSlide,
  CarouselViewport,
} from "@yacht-charter/ui/components/data-display/carousel";
import { useQuery } from "@tanstack/react-query";
import { Anchor, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";

import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";
import {
  toYachtTile,
  yachtCardListPrice,
  yachtCardPrice,
} from "@/components/shared/data-display/yacht-card/view-model";
import { listingDetailHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { RISE, VIEWPORT } from "@/lib/motion";

import { popularYachtsQueryOptions } from "../api/queries";

/*
 * The listing cards are the only request-backed part. Isolated so `useQuery`'s clock read stays
 * out of the prerendered shell — heading, carousel arrows and the "see all" CTA paint
 * immediately. With no data this renders no slides, matching what the carousel showed while the
 * query was pending.
 */
function PopularYachtSlides() {
  const t = useTranslations("Home.PopularYachts");
  const tCard = useTranslations("Common.boatCard");
  const money = useMoney();
  const locale = useLocale();
  const { data } = useQuery(popularYachtsQueryOptions(locale));
  const yachts = data?.items ?? [];

  return (
    <>
      {yachts.map((listing) => (
        <CarouselSlide key={listing.id} className="basis-85.5 pr-2 md:basis-88.5 md:pr-5">
          <YachtCard
            layout="tile"
            className="w-full"
            {...toYachtTile(listing, {
              image: listing.gallery[0] ?? listing.mainImage,
              imageSizes: "354px",
              location: placeLine(listing.base.location, listing.base.country),
              detailHref: listingDetailHref(listing),
              tags: [{ label: listing.category, icon: <Anchor /> }],
              price: yachtCardPrice(tCard, listing, (amountMinor, currency) =>
                money(Math.round(amountMinor / listing.priceDetails.periodDays), currency),
              ),
              /* The same day of the same charter, before the discount; `parts` divides it the
                 way the price above is divided. */
              listPrice: yachtCardListPrice(listing, money, listing.priceDetails.periodDays),
              priceSuffix: t("perDay"),
              priceLabel: t("from"),
              actionLabel: t("viewDetails"),
            })}
          />
        </CarouselSlide>
      ))}
    </>
  );
}

export default function PopularYachts() {
  const t = useTranslations("Home.PopularYachts");

  return (
    <section className="bg-brand-50">
      <div className="mx-auto max-w-384 px-4 pt-10 pb-10 md:px-13.5 md:pt-17.5 md:pb-17.25 xl:px-17.5 xl:pt-25 xl:pb-25">
        <Carousel options={{ align: "start", containScroll: "trimSnaps" }}>
          <motion.div
            variants={RISE}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT}
            className="mb-8 flex flex-col items-center gap-4 md:flex-row md:justify-between xl:mb-10"
          >
            <h2 className="text-h2">{t("heading")}</h2>
            <CarouselNav previousLabel={t("previous")} nextLabel={t("next")} />
          </motion.div>

          <CarouselViewport>
            <Suspense fallback={null}>
              <PopularYachtSlides />
            </Suspense>
          </CarouselViewport>
        </Carousel>

        <div className="mt-8 flex justify-center xl:mt-10">
          <Button
            variant="neutral"
            size="md"
            className="w-full md:w-auto"
            nativeButton={false}
            render={<Link href="/yachts" />}
          >
            {t("seeAll")}
            <ArrowUpRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
