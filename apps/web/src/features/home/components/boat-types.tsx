import { BoatCard } from "@yacht-charter/ui/components/data-display/card-boat";
import { useTranslations } from "next-intl";

/*
 * BoatTypes — Figma "Main Page" › Choose Your Boat Type (node 530:3157). A centered H2 over a
 * 4-up row of boat-type tiles (rounded photo + title + short blurb). Static content; the cards
 * reuse the design-system BoatCard so the look matches 1-to-1. Below xl the row wraps to 2-up,
 * then stacks on mobile.
 */
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
      <div className="mx-auto flex flex-col gap-8 px-4 pt-10 pb-8 md:px-[54px] md:pt-[70px] md:pb-[49px] xl:gap-10 xl:px-[70px] xl:pt-[100px] xl:pb-[60px]">
        <h2 className="text-h2 text-center text-balance text-foreground">{t("heading")}</h2>

        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 sm:gap-y-8 xl:grid-cols-4">
          {BOAT_TYPES.map((boat) => (
            <BoatCard
              key={boat.key}
              image={boat.image}
              imageAlt={t(`items.${boat.key}.imageAlt`)}
              title={t(`items.${boat.key}.title`)}
              description={t(`items.${boat.key}.description`)}
              className="w-full"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
