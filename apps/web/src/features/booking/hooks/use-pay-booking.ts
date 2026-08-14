"use client";

import { useElements, useStripe } from "@stripe/react-stripe-js";
import { env } from "@yacht-charter/env/web";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import { confirmCheckoutMutationOptions } from "../api/queries";
import { guestAccessFor } from "../lib/guest-access";
import { runPayment } from "../lib/pay";
import { serializeConfirmation } from "../lib/search-params";
import { useBooking } from "../components/booking-provider";

/**
 * Everything the card form and the wallet buttons need to take a payment: the same
 * sequence, the same refusal messages, and the same landing.
 *
 * Only usable inside `<Elements>` — `useStripe`/`useElements` throw without it.
 */
export function usePayBooking() {
  const t = useTranslations("Booking.payment.card");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const { bookingId } = useBooking();
  const confirmCheckout = useMutation(confirmCheckoutMutationOptions());

  const ready = Boolean(stripe && elements && bookingId);

  /** Returns true when the payment went through, so a caller can report its own failure. */
  async function pay(): Promise<boolean> {
    if (!stripe || !elements || !bookingId) return false;

    const confirmationPath = serializeConfirmation(`/yachts/${params.id}/booking/confirmation`, {
      method: "card",
      bookingId,
    });

    const result = await runPayment({
      stripe,
      elements,
      startIntent: () =>
        confirmCheckout.mutateAsync({
          bookingId,
          accessToken: guestAccessFor(bookingId),
          paymentPreference: "deposit",
        }),
      /*
       * Stripe navigates the browser itself, so this one carries the locale segment the
       * i18n router would otherwise add — `localePrefix: "always"` means an unprefixed
       * return_url would bounce through the middleware and lose Stripe's query params.
       */
      returnUrl: new URL(
        serializeConfirmation(`/${locale}/yachts/${params.id}/booking/confirmation`, {
          method: "card",
          bookingId,
        }),
        env.NEXT_PUBLIC_APP_URL,
      ).toString(),
    });

    switch (result.outcome) {
      case "paid":
      /*
       * Already settled: the money is in and the webhook owns the rest, so this is not
       * an error to apologise for. Same landing as a payment we just took.
       */
      // falls through
      case "alreadyPaid":
        router.push(confirmationPath);
        return true;
      case "invalid":
        return false;
      case "refused":
        toast.error(result.code === "QUOTE_EXPIRED" ? t("quoteExpired") : t("notPayable"));
        return false;
      case "unavailable":
        toast.error(t("unavailable"));
        return false;
      default:
        toast.error(result.message ?? t("failed"));
        return false;
    }
  }

  return { pay, ready };
}
