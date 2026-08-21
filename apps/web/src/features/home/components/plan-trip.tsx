import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight, Check } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

import ScrollTimeline from "./scroll-timeline";

const CHECKLIST = ["questions", "recommendation", "explore"] as const;

const STEPS = ["preferences", "recommendation", "yachts"] as const;
const PLAN_MY_TRIP_HREF = "/plan-my-trip";

export default function PlanTrip() {
  const t = useTranslations("Home.PlanTrip");

  return (
    <section className="w-full">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex max-w-384 flex-col gap-8 px-4 pt-10 pb-8 md:px-13.5 md:pt-17.5 md:pb-12.25 xl:flex-row xl:items-start xl:justify-between xl:gap-16 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        {/* Left — headline, checklist, CTA */}
        <motion.div variants={RISE} className="flex flex-col gap-6 xl:max-w-136">
          <h2 className="text-h2 text-center text-foreground md:text-left">{t("heading")}</h2>

          <ul className="flex flex-col gap-1.5">
            {CHECKLIST.map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 text-base text-foreground md:text-xl"
              >
                <Check className="size-6 shrink-0 text-brand" />
                {t(`checklist.${item}`)}
              </li>
            ))}
          </ul>

          <Button
            variant="brand"
            size="md"
            className="w-full self-start md:w-auto xl:mt-2"
            nativeButton={false}
            render={<Link href={PLAN_MY_TRIP_HREF} />}
          >
            {t("cta")}
            <ArrowUpRight />
          </Button>
        </motion.div>

        {/* Right — vertical timeline */}
        <ScrollTimeline
          className="xl:mt-4.5 xl:w-142"
          titleClassName="text-h5 text-foreground"
          gapClassName="pb-8 xl:pb-10"
          lastClassName="md:pb-4 xl:pb-0"
          steps={STEPS.map((step) => ({
            key: step,
            title: t(`steps.${step}.title`),
            description: t(`steps.${step}.description`),
          }))}
        />
      </motion.div>
    </section>
  );
}
