import { Button } from "@yacht-charter/ui/components/actions/button";
import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import { Image } from "@/components/shared/data-display/image";
import { Activity, Clock } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { serializeSearch } from "@/features/yachts";
import { Link } from "@/i18n/navigation";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

/*
 * There are no route pages yet, so each card lands on the catalogue filtered to its own
 * cruising ground and length. All three pointing at a bare `/yachts` made the three cards
 * one button: whichever route was clicked, the same unfiltered 18,000 boats came back.
 */
const ROUTES = [
  {
    key: "dalmatianCoast",
    image: "/assets/home/sailing-routes/dalmatian-coast.webp",
    days: 7,
    level: "easy",
    href: serializeSearch("/yachts", { country: ["croatia"], duration: "7" }),
  },
  {
    key: "greekCyclades",
    image: "/assets/home/sailing-routes/greek-cyclades.webp",
    days: 5,
    level: "advanced",
    href: serializeSearch("/yachts", { country: ["greece"], duration: "7" }),
  },
  {
    key: "amalfiCoast",
    image: "/assets/home/sailing-routes/amalfi-coast.webp",
    days: 6,
    level: "moderate",
    href: serializeSearch("/yachts", { country: ["italy"], duration: "7" }),
  },
] as const;

export default function SailingRoutes() {
  const t = useTranslations("Home.SailingRoutes");

  return (
    <section className="w-full">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex max-w-384 flex-col gap-8 px-4 pt-10 pb-10 md:gap-8 md:px-13.5 md:pt-17.5 md:pb-17.25 lg:gap-10 xl:px-17.5 xl:pt-25 xl:pb-25"
      >
        <motion.h2 variants={RISE} className="text-h2 text-center text-foreground">
          {t("heading")}
        </motion.h2>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3 lg:gap-5">
          {ROUTES.map((route, i) => (
            <motion.div key={route.key} variants={RISE}>
              <TripCard
                imageRender={
                  <Image
                    src={route.image}
                    alt={t(`items.${route.key}.imageAlt`)}
                    fill
                    sizes="(min-width: 1024px) 452px, 100vw"
                    className="object-cover"
                  />
                }
                title={
                  <Link
                    href={route.href}
                    className="rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {t(`items.${route.key}.title`)}
                  </Link>
                }
                description={t(`items.${route.key}.description`)}
                actionLabel={t("exploreRoute")}
                actionRender={<Link href={route.href} />}
                meta={[
                  { label: t("days", { count: route.days }), icon: <Clock /> },
                  { label: t(`levels.${route.level}`), icon: <Activity /> },
                ]}
                className="w-full"
                descriptionClassName={i === 1 ? "min-h-13.75 lg:min-h-0" : "min-h-19.75 lg:min-h-0"}
              />
            </motion.div>
          ))}
        </div>

        <motion.div variants={RISE} className="flex justify-center">
          <Button variant="neutral" size="md" className="w-full md:w-auto">
            {t("comingSoon")}
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
