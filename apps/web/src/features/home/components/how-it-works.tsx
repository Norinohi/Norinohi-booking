import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

const STEPS = ["destination", "yacht", "book"] as const;

function Timeline() {
  const t = useTranslations("Home.HowItWorks.steps");

  return (
    <motion.ol variants={GROUP} className="flex flex-col md:w-142">
      {STEPS.map((step, index) => {
        const isLast = index === STEPS.length - 1;
        return (
          <motion.li key={step} variants={RISE} className="flex gap-4 md:gap-6">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 size-4 shrink-0 rounded-full bg-brand" />
              {!isLast && <span className="w-0.5 flex-1 bg-brand-100" />}
            </div>
            <div className={isLast ? "" : "pb-8 xl:pb-10.5"}>
              <h3 className="text-xl leading-[1.1] font-semibold text-foreground md:text-2xl">
                {t(`${step}.title`)}
              </h3>
              <p className="mt-1.5 text-base leading-[1.4] text-natural-600 md:text-xl">
                {t(`${step}.description`)}
              </p>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

export default function HowItWorks() {
  const t = useTranslations("Home.HowItWorks");

  return (
    <section className="bg-background">
      <motion.div
        variants={GROUP}
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT}
        className="mx-auto flex max-w-384 flex-col gap-8 px-4 pt-10 pb-8 md:px-13.5 md:pt-17.5 md:pb-12.25 xl:flex-row xl:justify-between xl:gap-16 xl:px-17.5 xl:pt-25 xl:pb-15"
      >
        <motion.div
          variants={RISE}
          className="flex flex-col items-center gap-4 text-center md:items-start md:gap-6 md:text-left xl:max-w-136 xl:justify-center"
        >
          <h2 className="text-[40px] leading-[1.1] font-medium md:text-[50px]">{t("heading")}</h2>
          <p className="max-w-136 text-lg leading-[1.4] text-natural-600 md:max-w-none md:text-xl">
            {t("intro")}
            <br />
            {t("introSecondLine")}
          </p>
          <Button
            variant="brand"
            size="md"
            nativeButton={false}
            render={<Link href="/yachts" />}
            className="w-full md:w-auto xl:mt-2"
          >
            {t("cta")}
            <ArrowUpRight />
          </Button>
        </motion.div>

        <Timeline />
      </motion.div>
    </section>
  );
}
