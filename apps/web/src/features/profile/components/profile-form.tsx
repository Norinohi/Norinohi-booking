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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import deactivateIllustration from "../assets/deactivate-account.png";
import { useDeactivateProfile, useUpdateProfile } from "../hooks/use-profile";
import type { Profile } from "../types";
import ChangePasswordDialog from "./change-password-dialog";

/*
 * ProfileForm — Figma "Your Profile" (972:54538 desktop / 972:70725 tablet / 972:70921 mobile).
 * Card: titled header + a 2-column field grid (First/Last, Email/Phone), a masked password row
 * with a "Change Password" action, then the Save / Deactivate actions.
 * First/last name and phone persist via profile.update, an email change goes through
 * authClient.changeEmail, and Deactivate calls profile.deactivate before signing out
 * (reactivation is simply the next sign-in).
 */

function useProfileSchema() {
  const t = useTranslations("Profile.errors");

  return useMemo(
    () =>
      z.object({
        firstName: z.string().trim().min(1, t("firstNameRequired")),
        lastName: z.string().trim().min(1, t("lastNameRequired")),
        email: z.email(t("emailInvalid")),
        phone: z.string(),
      }),
    [t],
  );
}

type Values = z.infer<ReturnType<typeof useProfileSchema>>;

function toValues(profile: Profile): Values {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    email: profile.email,
    phone: profile.phone ?? "",
  };
}

export default function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved?: () => void;
}) {
  const t = useTranslations("Profile");
  const router = useRouter();

  const updateProfile = useUpdateProfile();
  const deactivateProfile = useDeactivateProfile();

  const schema = useProfileSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(profile),
    mode: "onTouched",
  });

  // Re-sync the form whenever fresh profile data lands (e.g. the post-save refetch).
  // React Query's structural sharing keeps `profile` referentially stable otherwise.
  useEffect(() => {
    form.reset(toValues(profile));
  }, [form, profile]);

  const onSubmit = async (values: Values) => {
    const phone = values.phone.trim();

    try {
      await updateProfile.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        phone: phone === "" ? null : phone,
      });
    } catch {
      toast.error(t("errors.updateFailed"));
      return;
    }

    if (values.email !== profile.email) {
      const { error } = await authClient.changeEmail({ newEmail: values.email });
      if (error) {
        toast.error(error.message ?? t("errors.emailChangeFailed"));
        return;
      }
    }

    onSaved?.();
  };

  const onDeactivate = async () => {
    try {
      await deactivateProfile.mutateAsync({});
    } catch {
      toast.error(t("errors.deactivateFailed"));
      return;
    }

    await authClient.signOut();
    router.push("/");
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        {/* Title */}
        <div className="border-b border-border px-5 py-5">
          <h1 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h1>
        </div>

        {/* Fields — 16px row/column gaps, 20px padding (Figma 972:54552) */}
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("firstName")}</FormLabel>
                  <FormControl>
                    <TextField autoComplete="given-name" className="leading-[1.25]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("lastName")}</FormLabel>
                  <FormControl>
                    <TextField autoComplete="family-name" className="leading-[1.25]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl>
                    <TextField
                      type="email"
                      inputMode="email"
                      autoComplete="email"
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("phone")}</FormLabel>
                  <FormControl>
                    <TextField
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      className="leading-[1.25]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Password (masked, non-editable) + Change Password */}
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2 md:items-end">
            <TextField
              label={t("password")}
              type="password"
              defaultValue="password12"
              readOnly
              autoComplete="off"
              className="leading-[1.25]"
            />
            <div className="flex">
              <ChangePasswordDialog />
            </div>
          </div>
        </div>

        {/* Actions — own section split by a separator (Figma 972:54562/54563) */}
        <div className="flex flex-col gap-4 border-t border-border p-5 sm:flex-row">
          <Button
            type="submit"
            variant="brand"
            size="md"
            className="w-full sm:w-auto"
            disabled={form.formState.isSubmitting}
          >
            {t("save")}
          </Button>

          <Dialog>
            <DialogTrigger
              render={
                <Button type="button" variant="destructive" size="md" className="w-full sm:w-auto">
                  {t("deactivate")}
                </Button>
              }
            />
            <DialogContent showClose mobileSheet>
              <img src={deactivateIllustration.src} alt="" className="size-[70px]" />
              <DialogHeader>
                <DialogTitle>{t("deactivateTitle")}</DialogTitle>
                <DialogDescription>{t("deactivateDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      size="md"
                      disabled={deactivateProfile.isPending}
                      onClick={onDeactivate}
                    >
                      {t("deactivate")}
                    </Button>
                  }
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </form>
    </Form>
  );
}
