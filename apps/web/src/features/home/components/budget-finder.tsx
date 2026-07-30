"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/*
 * BudgetFinder — Figma "Main Page" › Find Yachts By Your Budget (node 530:3117). A centered H2
 * over a brand-tinted bordered panel holding four labelled selectors, with a brand "View Results"
 * button centered underneath. Client component: SelectValue takes a render prop to translate the
 * chosen option, and a function cannot cross the server/client boundary. Real query wiring lands
 * with the search work.
 *
 * Option keys double as the Select's stable `value`, so a language change never rewrites state.
 */
const SELECTS = [
  {
    key: "budget",
    defaultValue: "budget300To600",
    options: ["budget0To300", "budget300To600", "budget600To1000", "budget1000Plus"],
  },
  {
    key: "people",
    defaultValue: "people2To4",
    options: ["people1To2", "people2To4", "people4To6", "people6To8", "people8Plus"],
  },
  {
    key: "skipper",
    defaultValue: "skipperYes",
    options: ["skipperYes", "skipperNo", "skipperOptional"],
  },
  {
    key: "destinations",
    defaultValue: "destinationsAll",
    options: [
      "destinationsAll",
      "destinationsCroatia",
      "destinationsGreece",
      "destinationsItaly",
      "destinationsTurkey",
      "destinationsCaribbean",
    ],
  },
] as const;

type BudgetOptionKey = (typeof SELECTS)[number]["options"][number];

export default function BudgetFinder() {
  const t = useTranslations("Home.BudgetFinder");

  return (
    <section className="w-full">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-8 px-4 py-[60px] md:px-[54px] md:pt-[70px] md:pb-[48px] 2xl:gap-10 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <h2 className="text-h2 text-center text-foreground">{t("heading")}</h2>

        <div className="flex flex-col gap-8 2xl:gap-6">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 rounded-3xl border border-brand-100 bg-brand-50 px-6 pt-6 pb-[30px] md:grid-cols-2 xl:grid-cols-4">
            {SELECTS.map((select) => (
              <div key={select.key} className="flex flex-col gap-1.5">
                <span className="text-sm leading-[1.2] font-semibold text-natural-700">
                  {t(`labels.${select.key}`)}
                </span>
                <Select defaultValue={select.defaultValue}>
                  <SelectTrigger className="h-12 bg-card">
                    <SelectValue>{(value) => t(`options.${value as BudgetOptionKey}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {select.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`options.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button variant="brand" size="md" nativeButton={false} render={<Link href="/yachts" />}>
              {t("viewResults")}
              <ArrowUpRight />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
