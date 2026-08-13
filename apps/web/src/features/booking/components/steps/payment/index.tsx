"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { type Path, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useMoney } from "@/hooks/use-money";

import { askQuestionMutationOptions, requestInvoiceMutationOptions } from "../../../api/queries";
import type { BookingValues } from "../../../lib/booking-form";
import { guestAccessFor } from "../../../lib/guest-access";
import { serializeConfirmation } from "../../../lib/search-params";
import { useBooking } from "../../booking-provider";
import AskQuestion from "./ask-question";
import PayByCard from "./pay-by-card";
import RequestInvoice from "./request-invoice";

type PaymentMethod = BookingValues["payment"]["method"];
const TABS: PaymentMethod[] = ["card", "invoice", "question"];

export default function PaymentStep() {
  const t = useTranslations("Booking.payment");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const money = useMoney();
  const { control, trigger, getValues, setValue } = useFormContext<BookingValues>();
  const { quote, bookingId } = useBooking();
  /* Undefined for a signed-in customer, whose session cookie authorises these calls instead. */
  const accessToken = guestAccessFor(bookingId);
  const requestInvoice = useMutation(requestInvoiceMutationOptions());
  const askQuestion = useMutation(askQuestionMutationOptions());
  const method = useWatch({ control, name: "payment.method" });

  /* Due-now, straight from the quote — the same figure `checkout.confirm` would charge. */
  const amount = quote ? money(quote.deposit.amountMinor) : "";
  const pending = requestInvoice.isPending || askQuestion.isPending;

  const cta = {
    card: t("card.cta", { amount }),
    invoice: t("invoice.cta", { amount }),
    question: t("question.cta"),
  }[method];

  /* Card is disabled until Stripe is configured (ADR-002); only invoice/question submit here. */
  async function submitPayment() {
    if (method === "card" || !bookingId) return;
    if (!(await trigger("payment"))) {
      for (const field of Object.keys(getValues(`payment.${method}`))) {
        // SAFETY: the field names are read back off the values at `payment.${method}`, so the
        // joined path always names a leaf of BookingValues.
        const path = `payment.${method}.${field}` as Path<BookingValues>;
        setValue(path, getValues(path), { shouldTouch: true });
      }
      return;
    }

    try {
      if (method === "invoice") {
        const invoice = getValues("payment.invoice");
        await requestInvoice.mutateAsync({
          bookingId,
          accessToken,
          billingEmail: invoice.email,
          billingName: invoice.name,
          addressLine1: invoice.addressLine1,
          addressLine2: invoice.addressLine2 || undefined,
          city: invoice.city || undefined,
          postalCode: invoice.postalCode || undefined,
          countryCode: invoice.countryCode,
          companyName: invoice.company || undefined,
          vatNumber: invoice.vat || undefined,
          registrationNumber: invoice.registration || undefined,
        });
      } else {
        await askQuestion.mutateAsync({
          bookingId,
          accessToken,
          question: getValues("payment.question.message"),
        });
      }
      router.push(
        serializeConfirmation(`/yachts/${params.id}/booking/confirmation`, { method, bookingId }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("submitFailed"));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{t("heading")}</h3>

        <Tabs
          variant="segmented"
          value={method}
          onValueChange={(value) => {
            const next = TABS.find((id) => id === value);
            if (next) setValue("payment.method", next);
          }}
        >
          <TabsList className="max-md:flex-col max-md:items-stretch">
            {TABS.map((id) => (
              <TabsTab key={id} value={id} className="flex-1 max-md:flex-none">
                {t(`tabs.${id}`)}
              </TabsTab>
            ))}
          </TabsList>

          <TabsPanel value="card">
            <PayByCard />
          </TabsPanel>
          <TabsPanel value="invoice">
            <RequestInvoice />
          </TabsPanel>
          <TabsPanel value="question">
            <AskQuestion />
          </TabsPanel>
        </Tabs>
      </div>

      <span aria-hidden className="block h-px w-full bg-border" />

      <div className="p-5">
        <Button
          variant="brand"
          className="h-13 w-full"
          disabled={method === "card" || pending || !bookingId}
          onClick={() => void submitPayment()}
        >
          {cta}
        </Button>
      </div>
    </>
  );
}
