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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

/*
 * ChangePasswordDialog — the "Change Password" flow on /profile. Owns its trigger
 * button; submits through authClient.changePassword with revokeOtherSessions, so
 * every other device is signed out once the password changes.
 */

function useChangePasswordSchema() {
  const t = useTranslations("Profile.errors");

  return useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t("currentPasswordRequired")),
          newPassword: z.string().min(8, t("passwordTooShort")),
          confirmPassword: z.string(),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          message: t("passwordMismatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );
}

type Values = z.infer<ReturnType<typeof useChangePasswordSchema>>;

const emptyValues: Values = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ChangePasswordDialog() {
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);

  const schema = useChangePasswordSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
    mode: "onTouched",
  });

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) form.reset(emptyValues);
  };

  const onSubmit = async (values: Values) => {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });

    if (error) {
      toast.error(error.message ?? t("errors.passwordChangeFailed"));
      return;
    }

    toast.success(t("passwordChanged"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="neutral" size="md" className="w-full md:w-auto">
            {t("changePassword")}
          </Button>
        }
      />
      <DialogContent showClose mobileSheet>
        <DialogHeader>
          <DialogTitle>{t("changePasswordTitle")}</DialogTitle>
          <DialogDescription>{t("changePasswordDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          {/* stopPropagation: the trigger lives inside the profile <form>; React bubbles
              submit events across the portal, and the outer form must not also submit. */}
          <form
            onSubmit={(event) => {
              event.stopPropagation();
              form.handleSubmit(onSubmit)(event);
            }}
            className="flex w-full flex-col gap-6"
          >
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("currentPassword")}</FormLabel>
                    <FormControl>
                      <TextField type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("newPassword")}</FormLabel>
                    <FormControl>
                      <TextField type="password" autoComplete="new-password" {...field} />
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
                    <FormLabel>{t("confirmPassword")}</FormLabel>
                    <FormControl>
                      <TextField type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex w-full flex-col gap-2 [&>*]:w-full">
              <Button
                type="submit"
                variant="brand"
                size="md"
                disabled={form.formState.isSubmitting}
              >
                {t("changePassword")}
              </Button>
              <DialogClose
                render={
                  <Button type="button" variant="neutral" size="md">
                    {t("cancel")}
                  </Button>
                }
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
