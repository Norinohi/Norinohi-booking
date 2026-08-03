"use client";

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

export default function AskQuestion() {
  const t = useTranslations("Booking.payment.question");
  const { control } = useFormContext<BookingValues>();

  return (
    <FormField
      control={control}
      name="payment.question.message"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("label")}</FormLabel>
          <FormControl>
            <TextField multiline placeholder={t("placeholder")} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
