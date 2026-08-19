"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import z from "zod";

/*
 * The billing block, defined once because two forms collect it: the wizard's payment step, where
 * it is one of three methods, and the balance page, where it is the whole form. The rules live
 * here rather than in either schema so the two cannot drift into disagreeing about what makes a
 * valid tax document.
 */
export const invoiceValuesSchema = z.object({
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
});

export type InvoiceValues = z.infer<typeof invoiceValuesSchema>;

/** The path prefix both forms mount the block at, so `RequestInvoice` can name its fields once. */
export type InvoiceFormValues = { payment: { invoice: InvoiceValues } };

export const INVOICE_DEFAULTS: InvoiceValues = {
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
};

/**
 * What makes the block a tax document: a billed party with a name and a postal address. The
 * company fields (name, VAT, registration) are what make it a B2B invoice and stay optional.
 *
 * A refinement rather than field rules, because the wizard collects this block alongside two
 * other payment methods that require none of it — there it runs only when invoice is chosen,
 * while the balance page runs it always.
 */
export function useInvoiceRefinement() {
  const t = useTranslations("Booking.errors");

  return useMemo(
    () =>
      (value: InvoiceValues, ctx: z.RefinementCtx, prefix: readonly string[] = []) => {
        const at = (field: string) => [...prefix, field];

        if (!z.email().safeParse(value.email).success) {
          ctx.addIssue({ code: "custom", path: at("email"), message: t("email") });
        }
        if (value.name.trim().length < 2) {
          ctx.addIssue({ code: "custom", path: at("name"), message: t("billingName") });
        }
        if (value.addressLine1.trim().length === 0) {
          ctx.addIssue({
            code: "custom",
            path: at("addressLine1"),
            message: t("billingAddress"),
          });
        }
        if (value.city.trim().length === 0) {
          ctx.addIssue({ code: "custom", path: at("city"), message: t("city") });
        }
        if (value.countryCode.length !== 2) {
          ctx.addIssue({ code: "custom", path: at("countryCode"), message: t("country") });
        }
      },
    [t],
  );
}
