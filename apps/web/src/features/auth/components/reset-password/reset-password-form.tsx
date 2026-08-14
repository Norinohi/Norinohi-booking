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

import { usePasswordToggleLabels } from "@/hooks/use-password-toggle-labels";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/*
 * ResetPasswordForm — the /reset-password screen. Reads the single-use token that Better
 * Auth appends to the redirect URL. With a valid token it submits a new password via
 * authClient.resetPassword and returns to /login; a missing/invalid token (?error=...)
 * shows a "request a new link" state instead. Same auth-card layout as sign-in-form.
 *
 * `firstPassword` (?welcome=1 on the link) means the account was provisioned by guest checkout
 * and has never had a password. Same token, same request — only the wording changes, because
 * "reset" describes something this visitor never did.
 */

function useResetSchema() {
  const t = useTranslations("Auth.ResetPassword.errors");
  return useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(8, t("passwordMin")),
          confirmPassword: z.string(),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          message: t("passwordMismatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );
}

type Values = z.infer<ReturnType<typeof useResetSchema>>;

export default function ResetPasswordForm({
  token,
  error,
  firstPassword = false,
}: {
  token?: string;
  error?: string;
  firstPassword?: boolean;
}) {
  const t = useTranslations("Auth.ResetPassword");
  const tFirst = useTranslations("Auth.ResetPassword.firstPassword");
  const router = useRouter();
  const schema = useResetSchema();
  const passwordToggle = usePasswordToggleLabels();

  // Read through both namespaces rather than switching the one passed to useTranslations:
  // the two are different literal types, and a union namespace does not survive the
  // typed-messages overload.
  const copy = firstPassword
    ? {
        welcome: tFirst("welcome"),
        cardTitle: tFirst("cardTitle"),
        submit: tFirst("submit"),
        submitting: tFirst("submitting"),
        success: tFirst("success"),
        newPasswordLabel: tFirst("newPassword.label"),
        newPasswordPlaceholder: tFirst("newPassword.placeholder"),
        confirmLabel: tFirst("confirmPassword.label"),
        confirmPlaceholder: tFirst("confirmPassword.placeholder"),
      }
    : {
        welcome: t("welcome"),
        cardTitle: t("cardTitle"),
        submit: t("submit"),
        submitting: t("submitting"),
        success: t("success"),
        newPasswordLabel: t("newPassword.label"),
        newPasswordPlaceholder: t("newPassword.placeholder"),
        confirmLabel: t("confirmPassword.label"),
        confirmPlaceholder: t("confirmPassword.placeholder"),
      };

  const form = useForm<Values>({
    defaultValues: { newPassword: "", confirmPassword: "" },
    resolver: zodResolver(schema),
    mode: "onTouched",
  });

  const invalid = !token || Boolean(error);

  const onSubmit = async ({ newPassword }: Values) => {
    if (!token) return;
    const { error: resetError } = await authClient.resetPassword({ newPassword, token });
    if (resetError) {
      toast.error(resetError.message ?? resetError.statusText);
      return;
    }
    toast.success(copy.success);
    router.push("/login");
  };

  return (
    <section className="px-4 pt-[122px] pb-16 md:pt-[109px] xl:pt-[113px]">
      <div className="mx-auto flex w-full max-w-[358px] flex-col gap-8 md:max-w-[660px] xl:max-w-[451px]">
        <h1 className="text-center text-[20px] leading-[1.3] font-bold text-foreground xl:text-[32px] xl:leading-[1.1]">
          {copy.welcome}
        </h1>

        <div className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
          <div className="border-b border-natural-100 px-5 py-5">
            <h2 className="text-center text-xl leading-[1.3] font-bold text-foreground">
              {invalid ? t("invalid.title") : copy.cardTitle}
            </h2>
          </div>

          {invalid ? (
            <div className="flex flex-col gap-4 p-5 text-center">
              <p className="text-base text-natural-400">{t("invalid.body")}</p>
              <Button
                type="button"
                variant="brand"
                size="md"
                className="w-full"
                onClick={() => router.push("/forgot-password")}
              >
                {t("invalid.action")}
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4 p-5"
              >
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.newPasswordLabel}</FormLabel>
                      <FormControl>
                        <TextField
                          type="password"
                          autoComplete="new-password"
                          {...passwordToggle}
                          placeholder={copy.newPasswordPlaceholder}
                          className="leading-[1.25]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{copy.confirmLabel}</FormLabel>
                      <FormControl>
                        <TextField
                          type="password"
                          autoComplete="new-password"
                          {...passwordToggle}
                          placeholder={copy.confirmPlaceholder}
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
                  {form.formState.isSubmitting ? copy.submitting : copy.submit}
                </Button>
              </form>
            </Form>
          )}
        </div>
      </div>
    </section>
  );
}
