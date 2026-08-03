"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type Path, useFormContext } from "react-hook-form";

import type { BookingValues } from "../lib/booking-form";
import ExtrasStep from "./steps/extras";
import GuestDetailsStep from "./steps/guest-details";
import PaymentStep from "./steps/payment";
import ReviewAndBookStep from "./steps/review-and-book";

const STEPS = [
  { id: "guestDetails", Content: GuestDetailsStep, cta: "continue", ownsFooter: false },
  { id: "extras", Content: ExtrasStep, cta: "saveAndContinue", ownsFooter: false },
  { id: "reviewAndBook", Content: ReviewAndBookStep, cta: "confirmBooking", ownsFooter: false },
  { id: "payment", Content: PaymentStep, cta: "continue", ownsFooter: true },
] as const;

type Step = (typeof STEPS)[number]["id"];

/*
 * BookingSteps — the four-step accordion of the booking flow (Figma 859:33153 /
 * 969:74447 / 969:74929). The `STEPS` list above is the whole flow: order, titles and
 * body component and CTA label. A step renders its body only — the card, the numbered badge,
 * the chevron toggle, the separators around the body and the CTA all belong here.
 * The body owns its own padding, because a step may be one padded block (Guest Details) or
 * several separated by a full-bleed rule (Extras).
 * Continue runs `trigger(step)`, which validates that branch of the schema and nothing
 * else, and advances only when it passes; the step never touches submission.
 * Every header stays clickable, so a step can be revisited. `multiple={false}` also means
 * the open step cannot be toggled shut — one is always expanded, except after the last Continue.
 */
export default function BookingSteps() {
  const t = useTranslations("Booking");
  const { trigger, getValues, setValue } = useFormContext<BookingValues>();
  const [open, setOpen] = useState<Step | null>(STEPS[0].id);
  const [completed, setCompleted] = useState<Set<Step>>(new Set());

  async function advance(step: Step, index: number) {
    if (await trigger(step)) {
      setCompleted((prev) => new Set(prev).add(step));
      setOpen(STEPS[index + 1]?.id ?? null);
      return;
    }
    /* `onTouched` only goes live after a blur, and `trigger` does not touch anything — so a
     * failed Continue has to touch this step itself, or a corrected field would stay red
     * until the next Continue. */
    for (const field of Object.keys(getValues(step))) {
      const path = `${step}.${field}` as Path<BookingValues>;
      setValue(path, getValues(path), { shouldTouch: true });
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {STEPS.map(({ id: step, Content, cta, ownsFooter }, index) => (
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
                {completed.has(step) ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check className="size-5" />
                  </span>
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px] leading-[1.3] font-semibold text-foreground">
                    {index + 1}
                  </span>
                )}
                <span className="truncate text-xl leading-[1.1] font-semibold text-foreground md:text-2xl md:leading-[1.3]">
                  {t(`steps.${step}`)}
                </span>
              </span>
            </AccordionTrigger>

            <AccordionContent>
              <span aria-hidden className="block h-px w-full bg-border" />
              <Content />
              {!ownsFooter && (
                <>
                  <span aria-hidden className="block h-px w-full bg-border" />
                  <div className="p-5">
                    <Button
                      variant="brand"
                      className="h-13 w-full"
                      onClick={() => void advance(step, index)}
                    >
                      {t(cta)}
                    </Button>
                  </div>
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ))}
    </div>
  );
}
