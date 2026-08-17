"use client";

import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import CountryCombobox from "@/components/shared/form/country-combobox";
import { authClient } from "@/lib/auth-client";

import type { BookingValues } from "../../lib/booking-form";

export default function GuestDetailsStep() {
  const t = useTranslations("Booking.guestDetails");
  const { data: session } = authClient.useSession();
  const { control, getValues, setValue } = useFormContext<BookingValues>();

  /* Prefill from the signed-in user, without clobbering anything already typed. */
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    if (!getValues("guestDetails.fullName")) setValue("guestDetails.fullName", user.name ?? "");
    if (!getValues("guestDetails.email")) setValue("guestDetails.email", user.email ?? "");
  }, [session, getValues, setValue]);

  return (
    <div className="flex flex-col gap-4 p-5">
      <Notification>{t("notice")}</Notification>

      {/* Said at the point the address is typed, because that is what decides the account:
          checkout never asks anyone to sign in, and nobody should discover afterwards that
          one was created for them. */}
      {session?.user ? null : <Notification>{t("guestNotice")}</Notification>}

      <FormField
        control={control}
        name="guestDetails.fullName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("fullName")}</FormLabel>
            <FormControl>
              <TextField placeholder={t("fullNamePlaceholder")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name="guestDetails.email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("email")}</FormLabel>
              <FormControl>
                <TextField type="email" placeholder={t("emailPlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="guestDetails.phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("phone")}</FormLabel>
              <FormControl>
                <TextField type="tel" placeholder={t("phonePlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* The charter base needs the guest's country before it will take the reservation. */}
      <FormField
        control={control}
        name="guestDetails.countryCode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("country")}</FormLabel>
            <FormControl>
              <CountryCombobox
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t("countryPlaceholder")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="guestDetails.specialRequests"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("specialRequests")}</FormLabel>
            <FormControl>
              <TextField multiline placeholder={t("specialRequestsPlaceholder")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
