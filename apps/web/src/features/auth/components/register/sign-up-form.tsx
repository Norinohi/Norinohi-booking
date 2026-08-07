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
import { Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { type ComponentProps, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/shared/feedback/loader";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

/*
 * SignUpForm — Figma "Registration" (972:53926 desktop / error variant 972:54137).
 * "Welcome to YachtCharter" heading over a self-contained card (358 → 660 → 451 wide across
 * mobile / tablet / desktop): a left-aligned card title split by a separator, then the field
 * stack (email + phone + full name + password), the brand submit, an "Or" divider, the Google
 * button and the switch-to-sign-in link. Mirrors SignInForm's structure and design-system
 * primitives (FormItem wires label ⇄ control ⇄ message; FormControl sets aria-invalid, so
 * TextField paints its own error border — matching the error variant's red field + red helper).
 * The phone field is collected but NOT persisted yet (better-auth stores only email/password/name).
 * The Google button is rendered per the design but not wired — social auth isn't configured.
 */

// Multicolour Google "G" — no lucide equivalent; inlined to match the Figma button.
function GoogleIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.74Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.79-2.11-6.73-4.96H1.29v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.96 1.2 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.11C6.21 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

type Values = { email: string; phone: string; name: string; password: string };

export default function SignUpForm() {
  const t = useTranslations("Auth.SignUp");
  const router = useRouter();
  const { isPending } = authClient.useSession();
  /* Referral invite links land here as /register?ref=NORI-... (referral.myCode's urlPath). */
  const [referralCode] = useQueryState("ref");

  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t("errors.emailInvalid")),
        phone: z.string(),
        name: z.string().min(2, t("errors.nameMin")),
        password: z.string().min(8, t("errors.passwordMin")),
      }),
    [t],
  );

  const form = useForm<Values>({
    defaultValues: { email: "", phone: "", name: "", password: "" },
    resolver: zodResolver(schema),
    mode: "onTouched",
  });

  const onSubmit = ({ email, name, password }: Values) =>
    // NOTE: `phone` is intentionally not sent — better-auth stores only email/password/name today.
    // TODO: persist phone once the user schema is extended.
    authClient.signUp.email(
      { email, name, password },
      {
        onSuccess: () => {
          // Sign-up auto-signs the user in, so the protected claim call is authorized here.
          // Fire-and-forget: a bad or expired code must not break a successful registration.
          if (referralCode) {
            void client.referral
              .claim({ code: referralCode })
              .then(({ accepted }) => {
                if (accepted) {
                  toast.success(t("referralApplied"));
                }
              })
              .catch(() => {});
          }
          router.push("/dashboard");
          toast.success(t("success"));
        },
        onError: (error: any) => {
          const message = error.error.message || error.error.statusText || "";
          if (/exist|registered|taken/i.test(`${error.error.code ?? ""} ${message}`)) {
            form.setError("email", { type: "manual", message: t("errors.emailRegistered") });
          } else {
            toast.error(message);
          }
        },
      },
    );

  if (isPending) {
    return <Loader />;
  }

  return (
    <section className="px-4 pt-6 pb-16 xl:pt-[69px]">
      <div className="mx-auto flex w-full max-w-[358px] flex-col gap-6 md:max-w-[660px] md:gap-8 xl:max-w-[451px]">
        <h1 className="text-center text-[20px] leading-[1.1] font-semibold text-foreground md:text-[24px] xl:text-[32px] xl:font-bold">
          {t("welcome")}
        </h1>

        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="overflow-hidden rounded-2xl border border-natural-100 bg-card"
          >
            {/* Card title */}
            <div className="border-b border-natural-100 px-5 py-5">
              <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("cardTitle")}</h2>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 p-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="data-[error=true]:text-foreground">
                      {t("email.label")}
                    </FormLabel>
                    <FormControl>
                      <TextField
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder={t("email.placeholder")}
                        startIcon={<Mail className="size-5!" />}
                        className="leading-[1.25]"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (form.formState.errors.email?.type === "manual") {
                            form.clearErrors("email");
                          }
                        }}
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
                    <FormLabel className="data-[error=true]:text-foreground">
                      {t("phone.label")}
                    </FormLabel>
                    <FormControl>
                      <TextField
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder={t("phone.placeholder")}
                        startIcon={<Phone className="size-5!" />}
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="data-[error=true]:text-foreground">
                      {t("name.label")}
                    </FormLabel>
                    <FormControl>
                      <TextField
                        autoComplete="name"
                        placeholder={t("name.placeholder")}
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
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="data-[error=true]:text-foreground">
                      {t("password.label")}
                    </FormLabel>
                    <FormControl>
                      <TextField
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("password.placeholder")}
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

              {/* Or divider */}
              <div className="relative flex justify-center">
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-natural-100" />
                <span className="relative bg-card px-2 text-sm text-natural-400">{t("or")}</span>
              </div>

              {/* Google — shown per the design, sign-up not wired yet */}
              <Button
                type="button"
                variant="neutral"
                size="md"
                className="w-full"
                onClick={() => toast.info(t("googleUnavailable"))}
              >
                {t("google")}
                <GoogleIcon className="size-5" />
              </Button>

              {/* Switch to sign in */}
              <div className="flex flex-col items-center gap-1">
                <p className="text-base text-natural-400">{t("haveAccount")}</p>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="cursor-pointer py-1.5 text-base font-bold text-foreground transition-colors hover:text-brand"
                >
                  {t("signIn")}
                </button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </section>
  );
}
