import { ORPCError } from "@orpc/client";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { z } from "zod";

/*
 * The refusals `checkout.confirm` names for itself. Parsed rather than read off the error,
 * because an ORPCError's `data` is whatever the server put there.
 */
const checkoutFailureSchema = z.object({
  code: z.enum(["QUOTE_EXPIRED", "ALREADY_PAID", "NOT_PAYABLE"]),
});

export type PaymentOutcome =
  /** Stripe has the money. The webhook owns what happens to the booking next. */
  | { outcome: "paid" }
  /** Already settled server-side; the confirmation screen reports where it got to. */
  | { outcome: "alreadyPaid" }
  /** Elements is showing the problem against the offending field; saying it twice helps nobody. */
  | { outcome: "invalid" }
  | { outcome: "refused"; code: "QUOTE_EXPIRED" | "NOT_PAYABLE" }
  | { outcome: "unavailable" }
  | { outcome: "failed"; message?: string };

/**
 * Take a payment for the booking, in the order deferred intent creation requires:
 * validate what was collected, only then open the PaymentIntent, then confirm against
 * it. Creating the intent first would leave a PAYMENT_PENDING booking behind every
 * abandoned card entry.
 *
 * Shared by the card form and the wallet buttons because the sequence is identical —
 * only the surface that collected the details differs — and two copies of an ordering
 * this load-bearing would drift.
 */
export async function runPayment(input: {
  stripe: Stripe;
  elements: StripeElements;
  /** Calls `checkout.confirm`; separate so this stays free of the query client. */
  startIntent: () => Promise<{ clientSecret: string }>;
  /** Where a redirect method comes back to. Cards and wallets never leave the page. */
  returnUrl: string;
}): Promise<PaymentOutcome> {
  const submitted = await input.elements.submit();
  if (submitted.error) return { outcome: "invalid" };

  let clientSecret: string;
  try {
    ({ clientSecret } = await input.startIntent());
  } catch (error) {
    /*
     * `checkout.confirm` refuses rather than charging a figure the customer was never
     * shown, and each refusal it names for itself gets its own answer here.
     */
    const failure = checkoutFailureSchema.safeParse(
      error instanceof ORPCError ? error.data : null,
    ).data;

    if (failure?.code === "ALREADY_PAID") return { outcome: "alreadyPaid" };
    if (failure) return { outcome: "refused", code: failure.code };

    if (error instanceof ORPCError && error.code === "NOT_IMPLEMENTED") {
      return { outcome: "unavailable" };
    }

    return { outcome: "failed", message: error instanceof Error ? error.message : undefined };
  }

  const { error } = await input.stripe.confirmPayment({
    elements: input.elements,
    clientSecret,
    confirmParams: { return_url: input.returnUrl },
    redirect: "if_required",
  });

  if (error) return { outcome: "failed", message: error.message };

  return { outcome: "paid" };
}
