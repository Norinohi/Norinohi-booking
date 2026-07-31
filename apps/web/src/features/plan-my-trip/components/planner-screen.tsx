"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { StepIndicator } from "@yacht-charter/ui/components/navigation/step-indicator";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";

import { plannerParsers, TOTAL_STEPS } from "../lib/search-params";
import { isStepComplete, PlannerSteps } from "./planner-steps";
import { ResultScreen } from "./result-screen";

/*
 * Wizard shell. Owns the chrome (step indicator, close, Back/Next) and the URL-backed answers;
 * each step's question UI lives in `PlannerSteps` and renders inside the card. Advancing pushes
 * the `step` param, so the browser Back button (and the Back control) walk the steps. Step
 * `TOTAL_STEPS + 1` is the terminal result screen — it drops the indicator and the Back/Next row.
 */
export default function PlannerScreen() {
  const t = useTranslations("PlanMyTrip");
  const router = useRouter();
  const [answers, setAnswers] = useQueryStates(plannerParsers);

  const current = Math.min(Math.max(answers.step, 1), TOTAL_STEPS + 1);
  const isResult = current > TOTAL_STEPS;
  const canProceed = isStepComplete(current, answers);

  // Slide direction for the step transition: forward (Next) enters from the right, back (Back)
  // enters from the left. Pure CSS via tw-animate-css utilities — no animation runtime. `prevStep`
  // holds the last committed step so `direction` is correct on the render where the step changes.
  const prevStep = useRef(current);
  const direction = current >= prevStep.current ? "forward" : "back";
  useEffect(() => {
    prevStep.current = current;
  }, [current]);

  return (
    <div className="px-4 py-8 md:px-13.5 md:py-15 2xl:px-17.5">
      {!isResult && (
        <StepIndicator
          total={TOTAL_STEPS}
          current={current}
          progressLabel={t("progress", { current, total: TOTAL_STEPS })}
          label={(shown, total) => t("progress", { current: shown, total })}
        />
      )}

      <div
        className={cn(
          "relative mx-auto w-full max-w-290 overflow-hidden rounded-3xl bg-card px-6 pt-18 pb-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:px-10 md:pt-10 md:pb-10",
          !isResult && "mt-4 md:mt-6",
        )}
      >
        <IconButton
          variant="subtle"
          size="sm"
          aria-label={t("close")}
          onClick={() => router.push("/")}
          className="absolute top-6 right-6 md:top-5 md:right-5"
        >
          <X />
        </IconButton>

        {isResult ? (
          <ResultScreen answers={answers} />
        ) : (
          <div className="flex flex-col gap-4 md:gap-8">
            {/* Re-keyed per step so it re-mounts and plays the enter animation each transition. */}
            <div
              key={current}
              className={cn(
                "animate-in fade-in-0 duration-500 ease-out motion-reduce:animate-none",
                direction === "forward" ? "slide-in-from-right-8" : "slide-in-from-left-8",
              )}
            >
              <PlannerSteps current={current} answers={answers} setAnswers={setAnswers} />
            </div>

            <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
              <Button variant="neutral" onClick={() => router.back()} className="w-full md:w-auto">
                {t("back")}
              </Button>
              <Button
                variant="brand"
                disabled={!canProceed}
                onClick={() => setAnswers({ step: current + 1 })}
                className="w-full md:w-auto"
              >
                {t("next")}
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
