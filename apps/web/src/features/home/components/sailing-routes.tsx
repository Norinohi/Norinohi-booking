import { Button } from "@yacht-charter/ui/components/actions/button";
import { TripCard } from "@yacht-charter/ui/components/data-display/card-trip";
import { Activity, Clock } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

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
                image={route.image}
                imageAlt={t(`items.${route.key}.imageAlt`)}
                title={t(`items.${route.key}.title`)}
                description={t(`items.${route.key}.description`)}
                actionLabel={t("exploreRoute")}
                actionRender={<Link href="/yachts" />}
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
