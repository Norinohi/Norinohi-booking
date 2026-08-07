"use client";

import { useMutation } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/** Records a "Get Consultation" enquiry from the trip planner's result screen. */
export function useCreateConsultationLead() {
  return useMutation(orpc.lead.create.mutationOptions());
}
