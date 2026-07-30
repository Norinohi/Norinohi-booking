import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/*
 * HowItWorks — Figma "Main Page" section (node 615:8282). Two columns: on the left a "How It
 * Works" heading, supporting copy and a brand "Find Yachts" link (node 615:8296); on the right a
 * vertical timeline of three steps (brand dot + brand-100 connector, value + description) built
 * locally in this file. Below 2xl the columns stack, timeline first-class beneath the intro.
 */

const STEPS = ["destination", "yacht", "book"] as const;

function Timeline() {
  const t = useTranslations("Home.HowItWorks.steps");

  return (
    <ol className="flex flex-col md:w-[568px] xl:w-[568px]">
      {STEPS.map((step, index) => {
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step} className="flex gap-4 md:gap-6 xl:gap-6">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 size-4 shrink-0 rounded-full bg-brand" />
              {!isLast && <span className="w-0.5 flex-1 bg-brand-100" />}
            </div>
            <div className={isLast ? "" : "pb-8 xl:pb-[42px]"}>
              <h3 className="text-xl leading-[1.1] font-semibold text-foreground md:text-2xl">
                {t(`${step}.title`)}
              </h3>
              <p className="mt-1.5 text-base leading-[1.4] text-natural-600 md:text-xl xl:text-xl">
                {t(`${step}.description`)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function HowItWorks() {
  const t = useTranslations("Home.HowItWorks");

  return (
    <section className="bg-background">
      <div className="mx-auto flex flex-col gap-8 px-4 pt-10 pb-8 md:px-[54px] md:pt-[70px] md:pb-[49px] xl:max-w-[1536px] xl:flex-row xl:justify-between xl:gap-16 xl:px-[70px] xl:pt-[100px] xl:pb-[60px]">
        <div className="flex flex-col items-center gap-4 text-center md:items-start md:gap-6 md:text-left xl:max-w-[544px] xl:justify-center">
          <h2 className="text-[40px] leading-[1.1] font-medium md:text-[50px] xl:text-[50px]">
            {t("heading")}
          </h2>
          <p className="max-w-[544px] text-lg leading-[1.4] text-natural-600 md:max-w-none md:text-xl xl:text-xl">
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
        </div>

        <Timeline />
      </div>
    </section>
  );
}
