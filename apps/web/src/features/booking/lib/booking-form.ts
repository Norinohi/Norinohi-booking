"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import z from "zod";

import { INVOICE_DEFAULTS, invoiceValuesSchema, useInvoiceRefinement } from "./invoice-form";

/*
 * The booking flow is ONE react-hook-form, keyed by step. `BookingSteps` gates Continue on
 * `trigger("<step>")`, which validates that branch of the schema and nothing else.
 *
 * Field paths are the contract between the shell and a step: a step owns `<step>.<field>`
 * and nothing else. Add a field to the schema here first, then register it.
 */
export const BOOKING_DEFAULTS: BookingValues = {
  guestDetails: { fullName: "", email: "", phone: "", countryCode: "", specialRequests: "" },
  extras: { optional: [] },
  reviewAndBook: { terms: false, cancellation: false },
  payment: {
    method: "card",
    invoice: INVOICE_DEFAULTS,
    question: { message: "" },
  },
};

/** Built in a hook, not as a constant, so the messages come out of the active locale. */
export function useBookingSchema() {
  const t = useTranslations("Booking.errors");
  const refineInvoice = useInvoiceRefinement();

  return useMemo(
    () =>
      z.object({
        guestDetails: z.object({
          fullName: z.string().min(2, t("fullName")),
          email: z.email(t("email")),
          phone: z.string().min(6, t("phone")),
          /* ISO 3166-1 alpha-2; the provider refuses a client without a country. */
          countryCode: z.string().length(2, t("country")),
          specialRequests: z.string(),
        }),
        extras: z.object({ optional: z.array(z.string()) }),
        reviewAndBook: z.object({
          terms: z.boolean().refine((value) => value, t("terms")),
          cancellation: z.boolean().refine((value) => value, t("cancellation")),
        }),
        payment: z
          .object({
            method: z.enum(["card", "invoice", "question"]),
            /*
             * Shape only: required-ness is applied in the refinement below, and only when
             * invoice is the chosen method, because none of it applies to the other two.
             */
            invoice: invoiceValuesSchema,
            question: z.object({ message: z.string() }),
          })
          .superRefine((value, ctx) => {
            if (value.method === "invoice") {
              refineInvoice(value.invoice, ctx, ["invoice"]);
            }
            if (value.method === "question" && value.question.message.trim().length === 0) {
              ctx.addIssue({
                code: "custom",
                path: ["question", "message"],
                message: t("paymentMessage"),
              });
            }
          }),
      }),
    [t, refineInvoice],
  );
}

export type BookingValues = z.infer<ReturnType<typeof useBookingSchema>>;
