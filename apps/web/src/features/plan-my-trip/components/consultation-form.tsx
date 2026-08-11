"use client";

import { useTranslations } from "next-intl";

import { LeadEnquiryForm } from "@/components/shared/form/lead-enquiry-form";

import type { PlannerAnswers } from "../lib/search-params";
import type { PlannerRecommendation } from "../types";

function summarizeRecommendation(recommendation: PlannerRecommendation) {
  return {
    destination: recommendation.destination,
    style: recommendation.style,
    durationDays: recommendation.durationDays,
    estimatedPrice: recommendation.estimatedPrice,
    listingId: recommendation.listing?.id ?? null,
  };
}

export function ConsultationForm({
  answers,
  recommendation,
  onSuccess,
}: {
  answers: PlannerAnswers;
  recommendation: PlannerRecommendation;
  onSuccess: () => void;
}) {
  const t = useTranslations("PlanMyTrip.result.consultationDialog");

  return (
    <LeadEnquiryForm
      kind="consultation"
      listingId={recommendation.listing?.id}
      context={{ answers, recommendation: summarizeRecommendation(recommendation) }}
      submitLabel={t("submit")}
      successMessage={t("success")}
      onSuccess={onSuccess}
    />
  );
}
