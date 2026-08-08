"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { QuizCard } from "@yacht-charter/ui/components/data-display/card-quiz";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Mail, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";

import { usePlannerRecommendation } from "../hooks/use-planner-recommendation";
import { plannerParsers } from "../lib/search-params";
import { ConsultationForm } from "./consultation-form";
import { StepLegend } from "./step-legend";

type Choice = "call" | "message";

/** /plan-my-trip/consultation — "Get Consultation" from the result screen, as its own page. */
export function ConsultationScreen() {
  const t = useTranslations("PlanMyTrip.consultation");
  const router = useRouter();
  const [answers] = useQueryStates(plannerParsers);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const { data: recommendation, isPending, isError, refetch } = usePlannerRecommendation(answers);

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-8 md:px-13.5 md:py-15 2xl:px-17.5">
      <div className="relative mx-auto flex w-full max-w-290 flex-col overflow-hidden rounded-3xl bg-card px-6 pt-18 pb-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:px-10 md:pt-10 md:pb-10">
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
          {isPending ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </div>
          ) : isError || !recommendation ? (
            <EmptyState
              title={t("error.title")}
              description={t("error.description")}
              action={
                <Button variant="brand" onClick={() => refetch()}>
                  {t("error.retry")}
                </Button>
              }
            />
          ) : submitted ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <StepLegend title={t("submitted.title")} subtitle={t("submitted.description")} />
            </div>
          ) : (
            <>
              <StepLegend title={t("title")} subtitle={choice ? undefined : t("subtitle")} />

              {choice === null && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <QuizCard
                    flag={<Phone className="size-5" />}
                    title={t("options.call.title")}
                    description={t("options.call.description")}
                    onClick={() => setChoice("call")}
                    className="w-full"
                  />
                  <QuizCard
                    flag={<Mail className="size-5" />}
                    title={t("options.message.title")}
                    description={t("options.message.description")}
                    onClick={() => setChoice("message")}
                    className="w-full"
                  />
                </div>
              )}

              {choice === "call" && (
                <div className="flex flex-col items-start gap-4">
                  <div className="flex w-full flex-col gap-2 rounded-2xl bg-brand-50 p-6">
                    <p className="text-base font-semibold text-foreground">
                      {t("placeholder.title")}
                    </p>
                    <p className="text-sm text-natural-600">{t("placeholder.description")}</p>
                    <Button
                      variant="brand"
                      className="mt-2 w-full md:w-auto"
                      onClick={() => setChoice("message")}
                    >
                      {t("placeholder.cta")}
                    </Button>
                  </div>
                  <Button variant="neutral" size="sm" onClick={() => setChoice(null)}>
                    {t("back")}
                  </Button>
                </div>
              )}

              {choice === "message" && (
                <div className="flex flex-col items-start gap-4">
                  <ConsultationForm
                    answers={answers}
                    recommendation={recommendation}
                    onSuccess={() => setSubmitted(true)}
                  />
                  <Button variant="neutral" size="sm" onClick={() => setChoice(null)}>
                    {t("back")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
