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

import type { BookingValues } from "../../../lib/booking-form";

/*
 * The billing details that end up on the invoice. Name, address and country are what make the
 * document a tax record; the company block underneath is optional and only fills in when the
 * charter is billed to a business.
 */
export default function RequestInvoice() {
  const t = useTranslations("Booking.payment.invoice");
  const { control, getValues, setValue } = useFormContext<BookingValues>();
  const countries = useCountryOptions();

  /* The guest from step 1 is the payer unless they say otherwise — don't make them retype it. */
  useEffect(() => {
    const guest = getValues("guestDetails");
    if (!getValues("payment.invoice.email")) setValue("payment.invoice.email", guest.email);
    if (!getValues("payment.invoice.name")) setValue("payment.invoice.name", guest.fullName);
    if (!getValues("payment.invoice.countryCode")) {
      setValue("payment.invoice.countryCode", guest.countryCode);
    }
  }, [getValues, setValue]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={control}
          name="payment.invoice.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("name")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("namePlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="payment.invoice.email"
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
      </div>

      <FormField
        control={control}
        name="payment.invoice.addressLine1"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("addressLine1")}</FormLabel>
            <FormControl>
              <TextField placeholder={t("addressLine1Placeholder")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="payment.invoice.addressLine2"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("addressLine2")}</FormLabel>
            <FormControl>
              <TextField placeholder={t("addressLine2Placeholder")} {...field} />
            </FormControl>
          </FormItem>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <FormField
          control={control}
          name="payment.invoice.city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("city")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("cityPlaceholder")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="payment.invoice.postalCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("postalCode")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("postalCodePlaceholder")} {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="payment.invoice.countryCode"
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
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FormField
          control={control}
          name="payment.invoice.company"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("company")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("companyPlaceholder")} {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="payment.invoice.vat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("vat")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("vatPlaceholder")} {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="payment.invoice.registration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("registration")}</FormLabel>
              <FormControl>
                <TextField placeholder={t("registrationPlaceholder")} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      <Notification>{t("notice")}</Notification>
    </div>
  );
}
