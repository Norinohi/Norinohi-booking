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

import type { InvoiceFormValues } from "../../../lib/invoice-form";

/*
 * The billing details that end up on the invoice. Name, address and country are what make the
 * document a tax record; the company block underneath is optional and only fills in when the
 * charter is billed to a business.
 *
 * Typed against the block alone rather than the wizard's whole form, because the balance page
 * collects the same details for a second instalment and has no wizard around it. Both mount it
 * at `payment.invoice`, so the field names below are the one thing they must agree on.
 *
 * `prefill` is whoever the payer already looks like — the wizard's guest step, or the booking's
 * own guest. Applied only to fields still empty, so it can never overwrite a correction.
 */
export default function RequestInvoice({
  prefill,
}: {
  prefill?: { email?: string; name?: string; countryCode?: string } | undefined;
}) {
  const t = useTranslations("Booking.payment.invoice");
  const { control, getValues, setValue } = useFormContext<InvoiceFormValues>();

  const prefillEmail = prefill?.email;
  const prefillName = prefill?.name;
  const prefillCountry = prefill?.countryCode;
  useEffect(() => {
    if (prefillEmail && !getValues("payment.invoice.email")) {
      setValue("payment.invoice.email", prefillEmail);
    }
    if (prefillName && !getValues("payment.invoice.name")) {
      setValue("payment.invoice.name", prefillName);
    }
    if (prefillCountry && !getValues("payment.invoice.countryCode")) {
      setValue("payment.invoice.countryCode", prefillCountry);
    }
  }, [prefillEmail, prefillName, prefillCountry, getValues, setValue]);

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
