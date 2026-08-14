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
import { Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/*
 * ForgotPasswordForm — the /forgot-password screen. Requests a reset link via
 * authClient.requestPasswordReset with a locale-aware redirectTo back to /reset-password.
 * Enumeration-safe: on any non-error response it shows one success state regardless of
 * whether the email exists. Built on the same auth-card layout as sign-in-form.
 *
 * `email` prefills the field. The booking confirmation email sends a guest here to set the
 * password their provisioned account never had, and it knows the address they booked with —
 * asking them to retype it is a step that can only go wrong.
 */

type Values = { email: string };

export default function ForgotPasswordForm({ email }: { email?: string }) {
  const t = useTranslations("Auth.ForgotPassword");
  const locale = useLocale();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);

  const schema = useMemo(() => z.object({ email: z.email(t("errors.emailInvalid")) }), [t]);

  const form = useForm<Values>({
    defaultValues: { email: email ?? "" },
    resolver: zodResolver(schema),
    mode: "onTouched",
  });

  const onSubmit = async ({ email }: Values) => {
    const redirectTo = `${window.location.origin}/${locale}/reset-password`;
    const { error } = await authClient.requestPasswordReset({ email, redirectTo });
    if (error) {
      toast.error(error.message ?? error.statusText);
      return;
    }
    setSubmitted(true);
  };

  return (
    <section className="px-4 pt-[122px] pb-16 md:pt-[109px] xl:pt-[113px]">
      <div className="mx-auto flex w-full max-w-[358px] flex-col gap-8 md:max-w-[660px] xl:max-w-[451px]">
        <h1 className="text-center text-[20px] leading-[1.3] font-bold text-foreground xl:text-[32px] xl:leading-[1.1]">
          {t("welcome")}
        </h1>

        <div className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
          <div className="border-b border-natural-100 px-5 py-5">
            <h2 className="text-center text-xl leading-[1.3] font-bold text-foreground">
              {t("cardTitle")}
            </h2>
          </div>

          {submitted ? (
            <div className="flex flex-col gap-4 p-5 text-center">
              <p className="text-base font-bold text-foreground">{t("success.title")}</p>
              <p className="text-base text-natural-400">{t("success.body")}</p>
              <Button
                type="button"
                variant="neutral"
                size="md"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                {t("backToLogin")}
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4 p-5"
              >
                <p className="text-base text-natural-400">{t("description")}</p>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email.label")}</FormLabel>
                      <FormControl>
                        <TextField
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder={t("email.placeholder")}
                          startIcon={<Mail className="size-5!" />}
                          className="leading-[1.25]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  variant="brand"
                  size="md"
                  className="w-full"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? t("submitting") : t("submit")}
                </Button>

                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="cursor-pointer py-1.5 text-center text-base font-bold text-foreground transition-colors hover:text-brand"
                >
                  {t("backToLogin")}
                </button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </section>
  );
}
