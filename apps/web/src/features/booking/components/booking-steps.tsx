"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

const STEPS = ["guestDetails", "extras", "reviewAndBook", "payment"] as const;

type Step = (typeof STEPS)[number];

/*
 * BookingSteps — the four-step accordion of the booking flow (Figma 859:33153 /
 * 969:74447 / 969:74929). It owns the card, the numbered badge, the chevron toggle,
 * the separators and Continue; a step passes only its body content, with no wrapper
 * and no padding of its own — the shell supplies both.
 * Continue advances to the next step and every header stays clickable, so a step can be
 * revisited. `multiple={false}` also means the open step cannot be toggled shut — one is
 * always expanded, except after Continue on the last step.
 */
export default function BookingSteps(content: Record<Step, ReactNode>) {
  const t = useTranslations("Booking");
  const [open, setOpen] = useState<Step | null>(STEPS[0]);

  return (
    <div className="flex w-full flex-col gap-6">
      {STEPS.map((step, index) => (
        <Accordion
          key={step}
          multiple={false}
          value={open === step ? [step] : []}
          onValueChange={(value) => setOpen(value.length > 0 ? step : null)}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <AccordionItem value={step}>
            <AccordionTrigger
              className="p-5"
              indicator={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-natural-50">
                  <ChevronDown className="size-4 transition-transform duration-200 group-data-panel-open:rotate-180" />
                </span>
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px] leading-[1.3] font-semibold text-foreground">
                  {index + 1}
                </span>
                <span className="truncate text-xl leading-[1.1] font-semibold text-foreground md:text-2xl md:leading-[1.3]">
                  {t(`steps.${step}`)}
                </span>
              </span>
            </AccordionTrigger>

            <AccordionContent>
              <span aria-hidden className="block h-px w-full bg-border" />
              <div className="flex flex-col gap-4 p-5">{content[step]}</div>
              <span aria-hidden className="block h-px w-full bg-border" />
              <div className="p-5">
                <Button
                  variant="brand"
                  className="h-13 w-full"
                  onClick={() => setOpen(STEPS[index + 1] ?? null)}
                >
                  {t("continue")}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ))}
    </div>
  );
}
