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
  guestDetails: { fullName: "", email: "", phone: "", countryCode: "", specialRequests: "" },
  extras: { optional: [] },
  reviewAndBook: { terms: false, cancellation: false },
  payment: {
    method: "card",
    invoice: {
      email: "",
      name: "",
      company: "",
      vat: "",
      registration: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      countryCode: "",
    },
    question: { message: "" },
  },
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
             * An invoice is a tax document, so the billed party needs a name and a postal
             * address; the company block (name, VAT, registration) is what makes it a B2B
             * invoice and stays optional. Required-ness is enforced in the refinement below,
             * not on the fields, because none of it applies to the other two methods.
             */
            invoice: z.object({
              email: z.string(),
              name: z.string(),
              company: z.string(),
              vat: z.string(),
              registration: z.string(),
              addressLine1: z.string(),
              addressLine2: z.string(),
              city: z.string(),
              postalCode: z.string(),
              countryCode: z.string(),
            }),
            question: z.object({ message: z.string() }),
          })
          .superRefine((value, ctx) => {
            if (value.method === "invoice") {
              if (!z.email().safeParse(value.invoice.email).success) {
                ctx.addIssue({ code: "custom", path: ["invoice", "email"], message: t("email") });
              }
              if (value.invoice.name.trim().length < 2) {
                ctx.addIssue({
                  code: "custom",
                  path: ["invoice", "name"],
                  message: t("billingName"),
                });
              }
              if (value.invoice.addressLine1.trim().length === 0) {
                ctx.addIssue({
                  code: "custom",
                  path: ["invoice", "addressLine1"],
                  message: t("billingAddress"),
                });
              }
              if (value.invoice.city.trim().length === 0) {
                ctx.addIssue({ code: "custom", path: ["invoice", "city"], message: t("city") });
              }
              if (value.invoice.countryCode.length !== 2) {
                ctx.addIssue({
                  code: "custom",
                  path: ["invoice", "countryCode"],
                  message: t("country"),
                });
              }
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
    [t],
  );
}

export type BookingValues = z.infer<ReturnType<typeof useBookingSchema>>;
