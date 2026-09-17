"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { useExactMoney } from "@/hooks/use-money";

import type { QuoteLine } from "../../api/queries";

/**
 * Quote line `group`s → the sidebar section they render under (i18n key on `sidebar.groups`).
 * An extra the base prices sits with the ones the offer priced: to the customer both are extras
 * they chose, and the difference is only in who we could book it through.
 */
export const GROUPS: readonly {
  groups: readonly QuoteLine["group"][];
  labelKey: "mandatory" | "selectedExtras" | "crew";
}[] = [
  { groups: ["mandatory"], labelKey: "mandatory" },
  { groups: ["optional", "requested"], labelKey: "selectedExtras" },
  { groups: ["crew"], labelKey: "crew" },
];

export interface PriceGroupProps {
  labelKey: (typeof GROUPS)[number]["labelKey"];
  lines: QuoteLine[];
}

export function PriceGroup({ labelKey, lines }: PriceGroupProps) {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const money = useExactMoney();

  return (
    <Accordion defaultValue={[labelKey]}>
      <AccordionItem value={labelKey}>
        <AccordionTrigger
          className="h-7 px-4"
          indicator={
            <ChevronDown className="size-5 shrink-0 text-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />
          }
        >
          <span className="text-xl text-foreground">{t(`sidebar.groups.${labelKey}`)}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col pt-3">
            {lines.map((line, index) => (
              <div key={line.code} className="flex flex-col">
                {index > 0 ? (
                  <span aria-hidden className="mt-3 mb-2.75 h-px w-full bg-border" />
                ) : null}
                <div className="flex items-start gap-2 px-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-base leading-5.5 text-foreground">{line.label}</p>
                    {/*
                      A line the charter already covers is collected nowhere, so naming a moment
                      to pay it is naming a payment nobody will make. The others all say when:
                      captioning only the ones settled at the base left the fees folded into the
                      prepayment - an APA among them - as the only rows with nothing under them,
                      which read as if they were not being charged for yet.
                    */}
                    {line.amount.amountMinor === 0 ? null : (
                      <p className="text-xs font-semibold text-natural-500">
                        {line.payWhen === "at_check_in"
                          ? tExtras("payAtCheckIn")
                          : tExtras("dueWithPrepayment")}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-base leading-5.5 font-bold text-foreground">
                    {line.amount.amountMinor === 0
                      ? tExtras("includedInPrice")
                      : money(line.amount.amountMinor, line.amount.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
