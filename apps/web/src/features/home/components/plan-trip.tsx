import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowUpRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/*
 * PlanTrip — Figma "Main Page" › Not Sure What To Choose… (node 530:3181). Two columns: on the
 * left an H2, a 3-item check-list and a brand CTA; on the right a vertical 3-step timeline
 * (brand dots joined by a hairline). Below 2xl the columns stack. The timeline is local to this
 * file — it is bespoke to this section and not a shared primitive.
 */
const CHECKLIST = ["questions", "recommendation", "explore"] as const;

const STEPS = ["preferences", "recommendation", "yachts"] as const;

export default function PlanTrip() {
  const t = useTranslations("Home.PlanTrip");

  return (
    <section className="w-full">
      <div className="mx-auto flex flex-col gap-8 px-4 pt-10 pb-8 md:px-[54px] md:pt-[70px] md:pb-[49px] xl:max-w-[1536px] xl:flex-row xl:items-start xl:justify-between xl:gap-16 xl:px-[70px] xl:pt-[100px] xl:pb-[60px]">
        {/* Left — headline, checklist, CTA */}
        <div className="flex flex-col gap-6 xl:max-w-[544px]">
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
            render={<Link href="/yachts" />}
          >
            {t("cta")}
            <ArrowUpRight />
          </Button>
        </div>

        {/* Right — vertical timeline */}
        <ol className="flex flex-col xl:mt-[18px] xl:w-[568px]">
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;
            return (
              <li key={step} className="flex gap-4 md:gap-6">
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
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
