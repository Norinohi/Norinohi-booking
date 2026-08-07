"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { useCreateConsultationLead } from "../hooks/use-create-consultation-lead";
import type { PlannerAnswers } from "../lib/search-params";
import type { PlannerRecommendation } from "../types";

function useConsultationLeadSchema() {
  const t = useTranslations("PlanMyTrip.result.consultationDialog.errors");

  return useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("nameRequired")).max(200),
        email: z.email(t("emailInvalid")),
        phone: z.string().trim().max(32).optional().or(z.literal("")),
        message: z.string().trim().max(2000).optional().or(z.literal("")),
      }),
    [t],
  );
}

type Values = z.infer<ReturnType<typeof useConsultationLeadSchema>>;

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
  const { data: session } = authClient.useSession();
  const createLead = useCreateConsultationLead();

  const schema = useConsultationLeadSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: session?.user.name ?? "",
      email: session?.user.email ?? "",
      phone: "",
      message: "",
    },
    mode: "onTouched",
  });

  const onSubmit = async (values: Values) => {
    try {
      await createLead.mutateAsync({
        kind: "consultation",
        listingId: recommendation.listing?.id,
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        message: values.message || undefined,
        context: { answers, recommendation: summarizeRecommendation(recommendation) },
      });
      toast.success(t("success"));
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.submitFailed"));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.name.label")}</FormLabel>
                <FormControl>
                  <TextField
                    autoComplete="name"
                    placeholder={t("fields.name.placeholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.email.label")}</FormLabel>
                <FormControl>
                  <TextField
                    type="email"
                    autoComplete="email"
                    placeholder={t("fields.email.placeholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.phone.label")}</FormLabel>
                <FormControl>
                  <TextField
                    type="tel"
                    autoComplete="tel"
                    placeholder={t("fields.phone.placeholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.message.label")}</FormLabel>
                <FormControl>
                  <TextField multiline placeholder={t("fields.message.placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          variant="brand"
          className="w-full md:w-auto"
          disabled={form.formState.isSubmitting}
        >
          {t("submit")}
        </Button>
      </form>
    </Form>
  );
}
