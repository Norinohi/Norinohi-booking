"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { StepIndicator } from "@yacht-charter/ui/components/navigation/step-indicator";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { parseAsInteger, useQueryState } from "nuqs";

/*
 * Wizard shell only. The per-step question UI is owned separately — it renders inside the dashed
 * placeholder below and owns a `PlanMyTrip.steps` namespace, so step strings never collide with
 * this shell's chrome under `PlanMyTrip.*`. Add `steps` to messages/*.json with the first step.
 */
const TOTAL_STEPS = 6;

export default function PlannerScreen() {
  const t = useTranslations("PlanMyTrip");
  const router = useRouter();
  const [step, setStep] = useQueryState(
    "step",
    parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true }),
  );

  const current = Math.min(Math.max(step, 1), TOTAL_STEPS);

  return (
    <div className="px-4 py-8 md:px-13.5 md:py-15 2xl:px-17.5">
      <StepIndicator
        total={TOTAL_STEPS}
        current={current}
        progressLabel={t("progress", { current, total: TOTAL_STEPS })}
        label={(shown, total) => t("progress", { current: shown, total })}
      />

      <div className="relative mx-auto mt-4 w-full max-w-290 rounded-3xl bg-card px-6 pt-18 pb-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:mt-6 md:px-10 md:pt-10 md:pb-10">
        <IconButton
          variant="subtle"
          size="sm"
          aria-label={t("close")}
          onClick={() => router.push("/")}
          className="absolute top-6 right-6 md:top-5 md:right-5"
        >
          <X />
        </IconButton>

        <div className="flex flex-col gap-4 md:gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="text-h4 text-foreground">{t("stepHeading", { current })}</h1>
            <p className="text-body-xl text-natural-600">{t("placeholder")}</p>
          </div>

          <div className="min-h-93.5 rounded-lg border border-dashed border-natural-200" />

          <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
            <Button variant="neutral" onClick={() => router.back()} className="w-full md:w-auto">
              {t("back")}
            </Button>
            <Button
              variant="brand"
              disabled={current === TOTAL_STEPS}
              onClick={() => setStep(current + 1)}
              className="w-full md:w-auto"
            >
              {t("next")}
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
