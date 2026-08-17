"use client";

import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { type ReactNode, useMemo } from "react";
import { type Path, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useMoney } from "@/hooks/use-money";

import {
  askQuestionMutationOptions,
  confirmCheckoutMutationOptions,
  requestInvoiceMutationOptions,
} from "../../../api/queries";
import type { BookingValues } from "../../../lib/booking-form";
import { guestAccessFor } from "../../../lib/guest-access";
import { serializeConfirmation } from "../../../lib/search-params";
import {
  ELEMENTS_APPEARANCE,
  ELEMENTS_FONTS,
  EXCLUDED_PAYMENT_METHOD_TYPES,
  elementsLocale,
  PAYMENT_METHOD_ORDER,
  stripeLoader,
} from "../../../lib/stripe";
import { useBooking } from "../../booking-provider";
import { PaymentTargetProvider } from "../../payment-target";
import AskQuestion from "./ask-question";
import CardPayButton from "./card-pay-button";
import PayByCard from "./pay-by-card";
import RequestInvoice from "./request-invoice";

type PaymentMethod = BookingValues["payment"]["method"];
const TABS: PaymentMethod[] = ["card", "invoice", "question"];

/**
 * Mounts Elements around the step when Stripe is configured and the quote has a figure to
 * charge, so the PaymentElement and the pay button share one provider.
 *
 * Deferred intent creation (`mode: "payment"` rather than a client secret): the customer
 * fills the card in before anything is opened server-side, and `checkout.confirm` runs only
 * when they press pay.
 */
export default function PaymentStep() {
  const { quote } = useBooking();
  const locale = useLocale();
  const stripe = stripeLoader();
  const dueNowMinor = quote?.deposit.amountMinor ?? 0;
  const currency = quote?.deposit.currency ?? "EUR";

  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: "payment",
      amount: dueNowMinor,
      currency: currency.toLowerCase(),
      locale: elementsLocale(locale),
      appearance: ELEMENTS_APPEARANCE,
      fonts: ELEMENTS_FONTS,
      paymentMethodOrder: PAYMENT_METHOD_ORDER,
      excludedPaymentMethodTypes: EXCLUDED_PAYMENT_METHOD_TYPES,
    }),
    [dueNowMinor, currency, locale],
  );

  /* Elements rejects a zero amount, so an unpriced quote falls back to the disabled panel. */
  if (!stripe || dueNowMinor <= 0) return <PaymentMethods cardEnabled={false} />;

  return (
    <Elements stripe={stripe} options={options}>
      <CheckoutPaymentTarget>
        <PaymentMethods cardEnabled />
      </CheckoutPaymentTarget>
    </Elements>
  );
}

/** The deposit, and the confirmation screen it lands on. The balance page supplies its own. */
function CheckoutPaymentTarget({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const { bookingId } = useBooking();
  const confirmCheckout = useMutation(confirmCheckoutMutationOptions());

  const target = useMemo(
    () => ({
      bookingId,
      startIntent: () =>
        confirmCheckout.mutateAsync({
          bookingId: bookingId ?? "",
          accessToken: guestAccessFor(bookingId),
          paymentPreference: "deposit" as const,
        }),
      landing: serializeConfirmation(`/yachts/${params.id}/booking/confirmation`, {
        method: "card",
        bookingId,
      }),
    }),
    [bookingId, params.id, confirmCheckout],
  );

  return <PaymentTargetProvider value={target}>{children}</PaymentTargetProvider>;
}

function PaymentMethods({ cardEnabled }: { cardEnabled: boolean }) {
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

  /* Card pays through CardPayButton, which needs the Elements context; only invoice/question here. */
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
            <PayByCard enabled={cardEnabled} />
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
        {method === "card" && cardEnabled ? (
          <CardPayButton label={cta} />
        ) : (
          <Button
            variant="brand"
            className="h-13 w-full"
            loading={pending}
            disabled={method === "card" || !bookingId}
            onClick={() => void submitPayment()}
          >
            {cta}
          </Button>
        )}
      </div>
    </>
  );
}
