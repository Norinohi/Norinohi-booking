"use client";

import { useElements, useStripe } from "@stripe/react-stripe-js";
import { env } from "@yacht-charter/env/web";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";

import type { AppPathname } from "@/i18n/navigation";

import { usePaymentTarget } from "../components/payment-target";
import { runPayment } from "../lib/pay";

export type PayBookingInput = {
  bookingId: string | null;
  /** Opens the PaymentIntent — `checkout.confirm` for a deposit, `payBalance` for the rest. */
  startIntent: () => Promise<{ clientSecret: string }>;
  /** Where to land once the money is in, and where a redirect method returns to. */
  landing: AppPathname;
};

/**
 * Takes a payment for a booking: the same sequence, refusal messages and landing,
 * whichever surface collected the details and whichever installment is being paid.
 *
 * Only usable inside `<Elements>` — `useStripe`/`useElements` throw without it.
 */
export function usePayBooking() {
  const { bookingId, startIntent, landing } = usePaymentTarget();
  const t = useTranslations("Booking.payment.card");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const locale = useLocale();

  const ready = Boolean(stripe && elements && bookingId);

  /** True when the payment went through, so a caller can report its own failure. */
  async function pay(): Promise<boolean> {
    if (!stripe || !elements || !bookingId) return false;

    const result = await runPayment({
      stripe,
      elements,
      startIntent,
      /*
       * Stripe navigates the browser itself, so this one carries the locale segment the
       * i18n router would otherwise add — `localePrefix: "always"` means an unprefixed
       * return_url would bounce through the middleware and lose Stripe's query params.
       */
      returnUrl: new URL(`/${locale}${landing}`, env.NEXT_PUBLIC_APP_URL).toString(),
    });

    switch (result.outcome) {
      case "paid":
      /*
       * Already settled: the money is in and the webhook owns the rest, so this is not
       * an error to apologise for. Same landing as a payment we just took.
       */
      // falls through
      case "alreadyPaid":
        router.push(landing);
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
