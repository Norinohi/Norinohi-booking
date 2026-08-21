import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import ScrollTimeline from "./scroll-timeline";

import { GROUP, RISE, VIEWPORT } from "@/lib/motion";

const STEPS = ["destination", "yacht", "book"] as const;

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

        <ScrollTimeline
          className="md:w-142"
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
