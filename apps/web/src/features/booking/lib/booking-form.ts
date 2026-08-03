"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import z from "zod";

/*
 * The booking flow is ONE react-hook-form, keyed by step. `BookingSteps` gates Continue on
 * `trigger("<step>")`, which validates that branch of the schema and nothing else.
 *
 * Field paths are the contract between the shell and a step: a step owns `<step>.<field>`
 * and nothing else. Add a field to the schema here first, then register it.
 */
export const BOOKING_DEFAULTS: BookingValues = {
  guestDetails: { fullName: "", email: "", phone: "", specialRequests: "" },
  /* TODO: mirrors the pre-selected extra in `steps/extras.tsx` until real listing data lands. */
  extras: { optional: ["sunbathing"] },
  reviewAndBook: { terms: false, cancellation: false },
  payment: {},
};

/** Built in a hook, not as a constant, so the messages come out of the active locale. */
export function useBookingSchema() {
  const t = useTranslations("Booking.errors");

  return useMemo(
    () =>
      z.object({
        guestDetails: z.object({
          fullName: z.string().min(2, t("fullName")),
          email: z.email(t("email")),
          phone: z.string().min(6, t("phone")),
          specialRequests: z.string(),
        }),
        extras: z.object({ optional: z.array(z.string()) }),
        reviewAndBook: z.object({
          terms: z.boolean().refine((value) => value, t("terms")),
          cancellation: z.boolean().refine((value) => value, t("cancellation")),
        }),
        payment: z.object({}),
      }),
    [t],
  );
}

export type BookingValues = z.infer<ReturnType<typeof useBookingSchema>>;
