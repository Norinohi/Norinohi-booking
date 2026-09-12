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
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import CountryCombobox from "@/components/shared/form/country-combobox";
import { authClient } from "@/lib/auth-client";

import { guestProfileQueryOptions } from "../../api/queries";
import type { BookingValues } from "../../lib/booking-form";

export default function GuestDetailsStep() {
  const t = useTranslations("Booking.guestDetails");
  const { data: session } = authClient.useSession();
  /*
   * The phone and the country are the fields the session cannot answer: better-auth keeps the
   * name and the address, while these live on the profile. Asked only of a signed-in visitor,
   * because `profile.get` is a protected procedure and a guest checkout would only earn a 401.
   */
  const { data: profile } = useQuery({
    ...guestProfileQueryOptions(),
    enabled: Boolean(session?.user),
  });
  const { control, getValues, setValue } = useFormContext<BookingValues>();

  /* Prefill from the signed-in user, without clobbering anything already typed. */
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    if (!getValues("guestDetails.fullName")) setValue("guestDetails.fullName", user.name ?? "");
    if (!getValues("guestDetails.email")) setValue("guestDetails.email", user.email ?? "");
  }, [session, getValues, setValue]);

  /*
   * Separate from the block above because it arrives separately -- a fetch rather than a session
   * the provider already holds -- and a profile with neither saved must leave both fields alone
   * rather than write empty strings over a draft the customer restored.
   */
  const savedPhone = profile?.phone;
  const savedCountry = profile?.countryCode;
  useEffect(() => {
    if (savedPhone && !getValues("guestDetails.phone")) {
      setValue("guestDetails.phone", savedPhone);
    }
    if (savedCountry && !getValues("guestDetails.countryCode")) {
      setValue("guestDetails.countryCode", savedCountry);
    }
  }, [savedPhone, savedCountry, getValues, setValue]);

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
