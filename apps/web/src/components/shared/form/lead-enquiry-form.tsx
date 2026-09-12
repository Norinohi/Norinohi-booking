"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import CountryCombobox from "@/components/shared/form/country-combobox";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

type LeadInput = Parameters<AppRouterClient["lead"]["create"]>[0];
type LeadKind = LeadInput["kind"];
/** Whatever the visitor was looking at, exactly as the contract accepts it. */
type LeadContext = NonNullable<LeadInput["context"]>;

function useLeadSchema() {
  const t = useTranslations("Common.leadForm.errors");

  return useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("nameRequired")).max(200),
        email: z.email(t("emailInvalid")),
        phone: z.string().trim().max(32).optional().or(z.literal("")),
        countryCode: z.string().trim().optional().or(z.literal("")),
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
interface LeadEnquiryFormProps {
  kind: LeadKind;
  listingId?: string;
  context?: LeadContext;
  /**
   * Adds the country field. Off by default: a quote has to be priced against where the customer
   * travels from, while "contact an expert" is a conversation that can ask for itself.
   */
  askCountry?: boolean;
  submitLabel: string;
  successMessage: string;
  submitClassName?: string;
  onSuccess?: () => void;
}

export function LeadEnquiryForm({
  kind,
  listingId,
  context,
  askCountry = false,
  submitLabel,
  successMessage,
  submitClassName = "w-full md:w-auto",
  onSuccess,
}: LeadEnquiryFormProps) {
  const t = useTranslations("Common.leadForm");
  const { data: session } = authClient.useSession();
  /*
   * The phone and the country the customer has already given us once. The session carries
   * neither, so they come from the profile -- asked only of a signed-in visitor, because
   * `profile.get` is protected and an enquiry is open to everyone.
   */
  const { data: profile } = useQuery({
    ...orpc.profile.get.queryOptions({ staleTime: 30_000 }),
    enabled: Boolean(session?.user),
  });
  const createLead = useMutation(orpc.lead.create.mutationOptions());

  const schema = useLeadSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: session?.user.name ?? "",
      email: session?.user.email ?? "",
      phone: "",
      countryCode: "",
      message: "",
    },
    mode: "onTouched",
  });

  /*
   * In an effect because the profile is a fetch: the form is already mounted with its defaults
   * by the time it lands. Only empty fields are filled, so a customer who has started typing
   * keeps what they wrote.
   */
  const { getValues, setValue } = form;
  const savedPhone = profile?.phone;
  const savedCountry = profile?.countryCode;
  useEffect(() => {
    if (savedPhone && !getValues("phone")) setValue("phone", savedPhone);
    if (savedCountry && !getValues("countryCode")) setValue("countryCode", savedCountry);
  }, [savedPhone, savedCountry, getValues, setValue]);

  const onSubmit = async (values: Values) => {
    try {
      await createLead.mutateAsync({
        kind,
        listingId,
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        countryCode: values.countryCode || undefined,
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
          {askCountry ? (
            <FormField
              control={form.control}
              name="countryCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.country.label")}</FormLabel>
                  <FormControl>
                    <CountryCombobox
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={t("fields.country.placeholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
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
          loading={form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
