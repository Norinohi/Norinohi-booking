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
    <ol className="flex flex-col md:w-[568px] 2xl:w-[568px]">
      {STEPS.map((step, index) => {
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step} className="flex gap-5 md:gap-6 2xl:gap-6">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 size-4 shrink-0 rounded-full bg-brand" />
              {!isLast && <span className="w-0.5 flex-1 bg-brand-100" />}
            </div>
            <div className={isLast ? "" : "pb-10 md:pb-8 2xl:pb-[42px]"}>
              <h3 className="text-2xl leading-[1.1] font-semibold text-foreground">
                {t(`${step}.title`)}
              </h3>
              <p className="mt-1.5 text-lg leading-[1.4] text-natural-600 md:text-xl 2xl:text-xl">
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
      <div className="mx-auto flex max-w-[1536px] flex-col gap-10 px-4 py-[60px] md:gap-8 md:px-[54px] md:pt-[70px] md:pb-[49px] 2xl:flex-row 2xl:justify-between 2xl:gap-16 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <div className="flex flex-col items-start gap-6 2xl:max-w-[544px] 2xl:justify-center">
          <h2 className="text-[32px] leading-[1.1] font-medium md:text-[50px] 2xl:text-[50px]">
            {t("heading")}
          </h2>
          <p className="max-w-[544px] text-lg leading-[1.4] text-natural-600 md:max-w-none md:text-xl 2xl:text-xl">
            {t("intro")}
            <br />
            {t("introSecondLine")}
          </p>
          <Button
            variant="brand"
            size="md"
            nativeButton={false}
            render={<Link href="/yachts" />}
            className="2xl:mt-2"
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
