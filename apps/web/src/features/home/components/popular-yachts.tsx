"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";
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

import { WishlistButton } from "@/features/wishlist";
import { useMoney } from "@/hooks/use-money";
import { boatCardPrice } from "@/lib/boat-card-fields";
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
      {yachts.map(({ listing }) => (
        <CarouselSlide key={listing.id} className="basis-85.5 pr-2 md:basis-88.5 md:pr-5">
          <BoatSmallCard
            className="w-full"
            image={listing.gallery[0] ?? listing.mainImage}
            imageAlt={listing.title}
            location={`${listing.base.location}, ${listing.base.country}`}
            title={
              <Link
                href={`/yachts/${listing.slug}`}
                className="rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {listing.title}
              </Link>
            }
            rating={listing.rating > 0 ? listing.rating : undefined}
            tags={[{ label: listing.category, icon: <Anchor /> }]}
            price={boatCardPrice(tCard, listing, (amountMinor, currency) =>
              money(Math.round(amountMinor / listing.priceDetails.periodDays), currency),
            )}
            priceSuffix={t("perDay")}
            priceLabel={t("from")}
            actionLabel={t("viewDetails")}
            actionRender={<Link href={`/yachts/${listing.slug}`} />}
            saveRender={<WishlistButton listingId={listing.id} />}
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
            <h2 className="text-[40px] leading-[1.1] font-medium md:text-[50px]">{t("heading")}</h2>
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
