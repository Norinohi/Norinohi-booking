"use client";

import { ORPCError } from "@orpc/client";
import { useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { env } from "@yacht-charter/env/web";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { confirmCheckoutMutationOptions } from "../../../api/queries";
import { guestAccessFor } from "../../../lib/guest-access";
import { serializeConfirmation } from "../../../lib/search-params";
import { useBooking } from "../../booking-provider";

/*
 * The refusals `checkout.confirm` names for itself. Parsed rather than read off the error,
 * because an ORPCError's `data` is whatever the server put there.
 */
const checkoutFailureSchema = z.object({
  code: z.enum(["QUOTE_EXPIRED", "ALREADY_PAID", "NOT_PAYABLE"]),
});

/**
 * Pays the deposit with the details held in the PaymentElement above it.
 *
 * Rendered only inside `<Elements>` — `useStripe`/`useElements` throw without that
 * provider — which is why the unconfigured path keeps the plain button in the parent.
 */
export default function CardPayButton({ label }: { label: string }) {
  const t = useTranslations("Booking.payment.card");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const { bookingId } = useBooking();
  const confirmCheckout = useMutation(confirmCheckoutMutationOptions());
  const [paying, setPaying] = useState(false);

  /*
   * The deferred-intent flow, in the order Stripe requires: validate the collected details,
   * only then open the PaymentIntent, then confirm against it. Creating the intent first
   * would leave a PAYMENT_PENDING booking behind every failed card validation.
   */
  async function pay() {
    if (!stripe || !elements || !bookingId) return;

    const confirmationPath = serializeConfirmation(`/yachts/${params.id}/booking/confirmation`, {
      method: "card",
      bookingId,
    });

    setPaying(true);
    try {
      const submitted = await elements.submit();
      if (submitted.error) {
        /* Already shown inline against the offending field; a toast would just repeat it. */
        return;
      }

      const { clientSecret } = await confirmCheckout.mutateAsync({
        bookingId,
        accessToken: guestAccessFor(bookingId),
        paymentPreference: "deposit",
      });

      /*
       * Stripe navigates the browser itself, so this one carries the locale segment the
       * i18n router would otherwise add — `localePrefix: "always"` means an unprefixed
       * return_url would bounce through the middleware and lose Stripe's query params.
       */
      const confirmation = serializeConfirmation(
        `/${locale}/yachts/${params.id}/booking/confirmation`,
        { method: "card", bookingId },
      );

      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret,
        /* Where a redirect method (iDEAL, Bancontact) comes back to; cards never leave. */
        confirmParams: {
          return_url: new URL(confirmation, env.NEXT_PUBLIC_APP_URL).toString(),
        },
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message ?? t("failed"));
        return;
      }

      /*
       * Stripe has the money; the booking is not confirmed until the webhook has run the
       * provider commit. The confirmation screen is what reports where that got to.
       */
      router.push(confirmationPath);
    } catch (error) {
      const failure = checkoutFailureSchema.safeParse(
        error instanceof ORPCError ? error.data : null,
      ).data;

      /*
       * The money is already in and the webhook owns the rest, so this is not an error to
       * apologise for — send them to the screen that reports where the booking got to.
       */
      if (failure?.code === "ALREADY_PAID") {
        router.push(confirmationPath);
        return;
      }

      /*
       * `checkout.confirm` refuses rather than charging a figure the customer was never
       * shown, so each refusal it names gets its own line instead of a generic failure.
       */
      if (failure?.code === "QUOTE_EXPIRED") toast.error(t("quoteExpired"));
      else if (failure?.code === "NOT_PAYABLE") toast.error(t("notPayable"));
      else if (error instanceof ORPCError && error.code === "NOT_IMPLEMENTED") {
        toast.error(t("unavailable"));
      } else toast.error(error instanceof Error ? error.message : t("failed"));
    } finally {
      setPaying(false);
    }
  }

  return (
    <Button
      variant="brand"
      className="h-13 w-full"
      disabled={!stripe || !elements || !bookingId || paying}
      onClick={() => void pay()}
    >
      {label}
    </Button>
  );
}
