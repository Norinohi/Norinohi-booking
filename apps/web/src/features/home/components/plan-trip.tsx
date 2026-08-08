import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowUpRight, Check } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

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
        <motion.ol variants={GROUP} className="flex flex-col xl:mt-4.5 xl:w-142">
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;
            return (
              <motion.li key={step} variants={RISE} className="flex gap-4 md:gap-6">
                <div className="flex flex-col items-center self-stretch">
                  <span className="mt-1.5 size-4 shrink-0 rounded-full bg-brand" />
                  {!isLast && <span className="w-px grow bg-brand-100" />}
                </div>
                <div
                  className={cn(
                    "flex flex-col gap-1.5 xl:gap-2",
                    isLast ? "md:pb-4 xl:pb-0" : "pb-8 xl:pb-10",
                  )}
                >
                  <h3 className="text-h5 text-foreground">{t(`steps.${step}.title`)}</h3>
                  <p className="text-base leading-[1.4] text-natural-600 md:text-xl">
                    {t(`steps.${step}.description`)}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </motion.div>
    </section>
  );
}
