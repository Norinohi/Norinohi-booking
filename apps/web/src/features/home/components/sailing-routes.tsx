import { Button } from "@yacht-charter/ui/components/actions/button";
import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import { Activity, ArrowUpRight, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/*
 * SailingRoutes — Figma "Main Page" › Popular Sailing Routes (node 605:3957). A centered H2 over
 * three TripCards (photo, title, blurb, duration/difficulty chips and an "Explore Route" action)
 * with a centered "All Routes" CTA below. Static content reusing the design-system TripCard; the
 * per-card "Explore Route" action is left unwired until route detail pages exist (see TODO).
 */
const ROUTES = [
  {
    key: "dalmatianCoast",
    image: "/assets/home/sailing-routes/dalmatian-coast.webp",
    days: 7,
    level: "easy",
  },
  {
    key: "greekCyclades",
    image: "/assets/home/sailing-routes/greek-cyclades.webp",
    days: 5,
    level: "advanced",
  },
  {
    key: "amalfiCoast",
    image: "/assets/home/sailing-routes/amalfi-coast.webp",
    days: 6,
    level: "moderate",
  },
] as const;

export default function SailingRoutes() {
  const t = useTranslations("Home.SailingRoutes");

  return (
    <section className="w-full">
      <div className="mx-auto flex flex-col gap-8 px-4 pt-10 pb-10 md:gap-8 md:px-[54px] md:pt-[70px] md:pb-[69px] lg:gap-10 xl:px-[70px] xl:pt-[100px] xl:pb-[100px]">
        <h2 className="text-h2 text-center text-foreground">{t("heading")}</h2>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3 lg:gap-5">
          {ROUTES.map((route, i) => (
            <TripCard
              key={route.key}
              image={route.image}
              imageAlt={t(`items.${route.key}.imageAlt`)}
              title={t(`items.${route.key}.title`)}
              description={t(`items.${route.key}.description`)}
              actionLabel={t("exploreRoute")}
              meta={[
                { label: t("days", { count: route.days }), icon: <Clock /> },
                { label: t(`levels.${route.level}`), icon: <Activity /> },
              ]}
              className="w-full"
              // Mobile + tablet mockups inflate card content with uneven trailing
              // whitespace: outer cards taller than the middle. Reserve description height to
              // reproduce it (ghost card's natural height is ~383). Reset at lg where the row
              // goes 3-up. Revisit once real route copy lands.
              descriptionClassName={i === 1 ? "min-h-[55px] lg:min-h-0" : "min-h-[79px] lg:min-h-0"}
            />
          ))}
        </div>

        <div className="flex justify-center">
          <Button
            variant="neutral"
            size="md"
            className="w-full md:w-auto"
            nativeButton={false}
            render={<Link href="/yachts" />}
          >
            {t("allRoutes")}
            <ArrowUpRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
