"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { env } from "@yacht-charter/env/web";
import { Check, Mail, Phone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";

import { usePlannerRecommendation } from "../hooks/use-planner-recommendation";
import { buildCalendlyUrl } from "../lib/build-calendly-url";
import { plannerParsers } from "../lib/search-params";
import { CalendlyWidget } from "./calendly-widget";
import { ConsultationForm } from "./consultation-form";
import { StepLegend } from "./step-legend";

type Channel = "call" | "message";

/*
 * /plan-my-trip/consultation — "Get Consultation" from the result screen, as its own page.
 * A channel is live on first paint: the visitor lands on the scheduler (or straight on the form
 * when Calendly isn't configured) and the tabs swap between the two, rather than spending a
 * click on a choice screen that told them nothing the widgets themselves don't.
 */
export function ConsultationScreen() {
  const t = useTranslations("PlanMyTrip.consultation");
  const router = useRouter();
  const [answers] = useQueryStates(plannerParsers);
  const calendlyUrl = env.NEXT_PUBLIC_CALENDLY_URL;
  const [channel, setChannel] = useState<Channel>(calendlyUrl ? "call" : "message");
  const [submitted, setSubmitted] = useState(false);
  const { data: recommendation, isPending, isError, refetch } = usePlannerRecommendation(answers);

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-8 md:px-13.5 md:py-15 2xl:px-17.5">
      {/* Narrower than the wizard's card: one channel at a time needs a column, not the full
          290 the result screen's two-up layout does. */}
      <div className="relative mx-auto flex w-full max-w-175 shrink-0 flex-col overflow-hidden rounded-3xl bg-card px-6 pt-18 pb-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:px-10 md:pt-10 md:pb-10">
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
            <ConsultationSkeleton />
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
          ) : (
            <>
              <div className="text-center">
                <StepLegend title={t("title")} subtitle={t("subtitle")} />
              </div>

              <Tabs
                value={channel}
                onValueChange={(value) => setChannel(value === "message" ? "message" : "call")}
                className="gap-6"
              >
                <TabsList className="justify-center">
                  <TabsTab value="call" className="flex items-center gap-2">
                    <Phone className="size-4" />
                    {t("options.call.title")}
                  </TabsTab>
                  <TabsTab value="message" className="flex items-center gap-2">
                    <Mail className="size-4" />
                    {t("options.message.title")}
                  </TabsTab>
                </TabsList>

                {/* Kept mounted: remounting reloads Calendly's iframe from scratch, so a visitor
                    who peeks at the form and comes back would lose the day they had picked. */}
                <TabsPanel keepMounted value="call" className="flex flex-col items-center gap-4">
                  <p className="text-center text-sm text-natural-600">
                    {t("options.call.description")}
                  </p>
                  {calendlyUrl ? (
                    <CalendlyWidget url={buildCalendlyUrl(calendlyUrl, answers)} />
                  ) : (
                    <div className="flex w-full flex-col items-start gap-2 rounded-2xl bg-brand-50 p-6">
                      <p className="text-base font-semibold text-foreground">
                        {t("placeholder.title")}
                      </p>
                      <p className="text-sm text-natural-600">{t("placeholder.description")}</p>
                      <Button
                        variant="brand"
                        className="mt-2 w-full md:w-auto"
                        onClick={() => setChannel("message")}
                      >
                        {t("placeholder.cta")}
                      </Button>
                    </div>
                  )}
                </TabsPanel>

                <TabsPanel
                  value="message"
                  className="mx-auto flex w-full max-w-125 flex-col items-center gap-4"
                >
                  <p className="text-center text-sm text-natural-600">
                    {t("options.message.description")}
                  </p>
                  {submitted ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand-50 p-6 text-center">
                      <Check className="size-8 text-brand" />
                      <p className="text-base font-semibold text-foreground">
                        {t("submitted.title")}
                      </p>
                      <p className="text-sm text-natural-600">{t("submitted.description")}</p>
                    </div>
                  ) : (
                    <ConsultationForm
                      answers={answers}
                      recommendation={recommendation}
                      onSuccess={() => setSubmitted(true)}
                    />
                  )}
                </TabsPanel>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mirrors the tabs + panel shape so the card doesn't jump when the recommendation lands. */
function ConsultationSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-8 w-64 max-w-full rounded-lg" />
        <Skeleton className="h-6 w-80 max-w-full rounded-lg" />
      </div>
      <div className="flex flex-col items-center gap-6">
        <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-100 w-full rounded-2xl" />
      </div>
    </div>
  );
}
