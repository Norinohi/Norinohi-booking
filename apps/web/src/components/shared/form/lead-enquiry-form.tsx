"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { AppRouterClient } from "@yacht-charter/api/routers/index";
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
import { orpc } from "@/utils/orpc";

type LeadKind = Parameters<AppRouterClient["lead"]["create"]>[0]["kind"];

function useLeadSchema() {
  const t = useTranslations("Common.leadForm.errors");

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

type Values = z.infer<ReturnType<typeof useLeadSchema>>;

/*
 * The enquiry form behind every "leave your details" entry point — Request Quote on a yacht,
 * Contact a charter expert, Get Consultation. The three differ only in `kind`, the `context`
 * blob (what the visitor was looking at) and the copy, so those ride in as props while the fields,
 * validation, session prefill and the `lead.create` call live here once.
 */
export function LeadEnquiryForm({
  kind,
  listingId,
  context,
  submitLabel,
  successMessage,
  submitClassName = "w-full md:w-auto",
  onSuccess,
}: {
  kind: LeadKind;
  listingId?: string;
  context?: Record<string, unknown>;
  submitLabel: string;
  successMessage: string;
  submitClassName?: string;
  onSuccess?: () => void;
}) {
  const t = useTranslations("Common.leadForm");
  const { data: session } = authClient.useSession();
  const createLead = useMutation(orpc.lead.create.mutationOptions());

  const schema = useLeadSchema();
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
        kind,
        listingId,
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        message: values.message || undefined,
        context,
      });
      toast.success(successMessage);
      onSuccess?.();
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
                  <TextField
                    className="h-full"
                    multiline
                    placeholder={t("fields.message.placeholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          variant="brand"
          className={submitClassName}
          disabled={form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
