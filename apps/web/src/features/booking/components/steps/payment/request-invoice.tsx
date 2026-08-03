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
import { useFormContext } from "react-hook-form";

import type { BookingValues } from "../../../lib/booking-form";

export default function RequestInvoice() {
  const t = useTranslations("Booking.payment.invoice");
  const { control } = useFormContext<BookingValues>();

  return (
    <div className="flex flex-col gap-4">
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

      <div className="grid gap-4 md:grid-cols-2">
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
      </div>

      <Notification>{t("notice")}</Notification>
    </div>
  );
}
