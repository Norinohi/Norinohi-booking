import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

const BOAT_TYPES = [
  { key: "catamaran", image: "/assets/home/boat-types/catamaran.webp" },
  { key: "sailingYacht", image: "/assets/home/boat-types/sailing-yacht.webp" },
  { key: "motorYacht", image: "/assets/home/boat-types/motor-yacht.webp" },
  { key: "luxuryYacht", image: "/assets/home/boat-types/luxury-yacht.webp" },
] as const;

export default function BoatTypes() {
  const t = useTranslations("Home.BoatTypes");

  return (
    <section className="w-full">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex flex-col gap-8 px-4 pt-10 pb-8 md:px-13.5 md:pt-17.5 md:pb-12.25 xl:gap-10 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        <motion.h2 variants={RISE} className="text-h2 text-center text-balance text-foreground">
          {t("heading")}
        </motion.h2>

        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 sm:gap-y-8 xl:grid-cols-4">
          {BOAT_TYPES.map((boat) => (
            <motion.div key={boat.key} variants={RISE}>
              <BoatCard
                image={boat.image}
                imageAlt={t(`items.${boat.key}.imageAlt`)}
                title={t(`items.${boat.key}.title`)}
                description={t(`items.${boat.key}.description`)}
                className="w-full"
              />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
