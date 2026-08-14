"use client";

import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useCountryOptions } from "@/hooks/use-country-options";
import { authClient } from "@/lib/auth-client";

import type { BookingValues } from "../../lib/booking-form";

export default function GuestDetailsStep() {
  const t = useTranslations("Booking.guestDetails");
  const { data: session } = authClient.useSession();
  const { control, getValues, setValue } = useFormContext<BookingValues>();
  const countries = useCountryOptions();

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
            <SelectRoot
              value={field.value || null}
              onValueChange={(next) => field.onChange(next ?? "")}
            >
              <FormControl>
                <SelectTrigger onBlur={field.onBlur}>
                  <SelectValue placeholder={t("countryPlaceholder")}>
                    {(current) =>
                      current
                        ? (countries.find((option) => option.value === current)?.label ?? current)
                        : t("countryPlaceholder")
                    }
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {countries.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
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
