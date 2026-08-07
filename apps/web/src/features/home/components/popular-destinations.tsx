"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Carousel,
  CarouselSlide,
  CarouselViewport,
  useCarousel,
} from "@yacht-charter/ui/components/data-display/carousel";
import { DestinationCard } from "@yacht-charter/ui/components/data-display/card-destination";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { useFilterOptions } from "@/components/shared/form/filters";
import { buildSearchHref } from "@/features/yachts";
import { useMoney } from "@/hooks/use-money";
import { RISE, VIEWPORT } from "@/lib/motion";

function NavArrows() {
  const t = useTranslations("Home.PopularDestinations");
  const { api, canScrollPrev, canScrollNext } = useCarousel();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("previous")}
        disabled={!canScrollPrev}
        onClick={() => api?.scrollPrev()}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="neutral"
        size="icon-md"
        aria-label={t("next")}
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export default function PopularDestinations() {
  const t = useTranslations("Home.PopularDestinations");
  const money = useMoney();
  const { options } = useFilterOptions();

  return (
    <section className="w-full">
      <div className="mx-auto max-w-384 pt-10 pb-8 md:pt-17.5 md:pb-12.5 xl:pt-25 xl:pb-15">
        <Carousel options={{ align: "start" }} className="flex flex-col gap-8 xl:gap-10">
          <motion.div
            variants={RISE}
            initial="hidden"
            whileInView="show"
            viewport={VIEWPORT}
            className="flex items-center justify-between gap-4 px-4 md:px-13.5 xl:px-17.5"
          >
            <h2 className="text-h2 text-foreground">{t("heading")}</h2>
            <NavArrows />
          </motion.div>

          <CarouselViewport className="pl-4 md:pl-13.5 xl:pl-17.5">
            {options.countries.map((country) => (
              <CarouselSlide
                key={country.value}
                className="basis-[85%] pr-5 sm:basis-1/2 md:basis-105 lg:basis-1/3 xl:basis-105"
              >
                <Link
                  href={buildSearchHref({ country: [country.value] })}
                  className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <DestinationCard
                    image={country.imageUrl ?? ""}
                    imageAlt={country.label}
                    title={country.label}
                    subtitle={t("summary", {
                      price: money(country.priceFromMinor ?? 0),
                      count: country.count ?? 0,
                    })}
                    className="w-full transition-transform duration-200 group-hover:-translate-y-1"
                  />
                </Link>
              </CarouselSlide>
            ))}
          </CarouselViewport>

          <div className="flex justify-center px-4 md:px-13.5 xl:px-17.5">
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
        </Carousel>
      </div>
    </section>
  );
}
