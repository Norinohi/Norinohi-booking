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
      <div className="mx-auto flex max-w-[1536px] flex-col gap-8 px-4 py-[60px] md:px-[54px] md:pt-[70px] md:pb-[49px] 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-16 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        {/* Left — headline, checklist, CTA */}
        <div className="flex flex-col gap-6 2xl:max-w-[544px]">
          <h2 className="text-h2 text-foreground">{t("heading")}</h2>

          <ul className="flex flex-col gap-1.5">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-3 text-body-xl text-foreground">
                <Check className="size-6 shrink-0 text-brand" />
                {t(`checklist.${item}`)}
              </li>
            ))}
          </ul>

          <Button
            variant="brand"
            size="md"
            className="self-start 2xl:mt-2"
            nativeButton={false}
            render={<Link href="/yachts" />}
          >
            {t("cta")}
            <ArrowUpRight />
          </Button>
        </div>

        {/* Right — vertical timeline */}
        <ol className="flex flex-col 2xl:mt-[18px] 2xl:w-[568px]">
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;
            return (
              <li key={step} className="flex gap-6">
                <div className="flex flex-col items-center self-stretch">
                  <span className="mt-1.5 size-4 shrink-0 rounded-full bg-brand" />
                  {!isLast && <span className="w-px grow bg-brand-100" />}
                </div>
                <div
                  className={cn(
                    "flex flex-col gap-1.5 2xl:gap-2",
                    isLast ? "pb-4 2xl:pb-0" : "pb-8 2xl:pb-10",
                  )}
                >
                  <h3 className="text-h5 text-foreground">{t(`steps.${step}.title`)}</h3>
                  <p className="text-body-xl text-natural-600">{t(`steps.${step}.description`)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
