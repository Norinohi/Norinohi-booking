"use client";

import { ExpressCheckoutElement } from "@stripe/react-stripe-js";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { usePayBooking } from "../../../hooks/use-pay-booking";

/* Matches the h-13 Pay button below, so the two do not disagree by a few pixels. */
const BUTTON_HEIGHT = 52;

/**
 * Apple Pay, Google Pay, PayPal and Link, above the card form.
 *
 * A wallet buried as a row inside the accordion converts badly: it shows only
 * "another step will appear" because it collects nothing inline, so the customer sees
 * a placeholder rather than the one-tap payment they recognise. These render as the
 * real branded buttons and open their own sheet.
 *
 * Which ones appear is decided by Stripe from the Dashboard, the device and the
 * browser. Apple Pay additionally needs the domain registered and Safari; Google Pay
 * needs a card saved in the browser. So this renders nothing at all rather than an
 * empty gap when none of them are available.
 */
export default function ExpressCheckout() {
  const t = useTranslations("Booking.payment.card");
  const { pay, ready } = usePayBooking();
  const [available, setAvailable] = useState<boolean | null>(null);

  /* Null while Stripe decides: the buttons should appear complete, not grow into place. */
  if (available === false) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="express-checkout">
      <ExpressCheckoutElement
        options={{
          buttonHeight: BUTTON_HEIGHT,
          /*
           * Klarna and Amazon Pay are off: both are credit or account products whose
           * dispute handling sits outside the chargeback flow, and neither was asked for.
           */
          paymentMethods: {
            applePay: "auto",
            googlePay: "auto",
            paypal: "auto",
            link: "auto",
            klarna: "never",
            amazonPay: "never",
          },
          // Two per row, and never a "more" overflow — an inline list beats a menu here.
          layout: { maxColumns: 2, maxRows: 2, overflow: "never" },
          buttonTheme: { applePay: "black", googlePay: "black", paypal: "gold" },
        }}
        /*
         * Stripe reports the set even when every entry is false, so the object being
         * present is not the question — whether any of the four we asked for can
         * actually render is. Without this the divider sits above an empty element on
         * any browser with no wallet configured.
         */
        onReady={(event) => {
          const methods = event.availablePaymentMethods;
          setAvailable(
            Boolean(
              methods && (methods.applePay || methods.googlePay || methods.paypal || methods.link),
            ),
          );
        }}
        /*
         * The wallet sheet is already open by now, and it stays open until this
         * resolves: `paymentFailed` is what closes it with an error rather than
         * leaving the customer looking at a spinner.
         */
        onConfirm={(event) => {
          void pay().then((paid) => {
            if (!paid) event.paymentFailed({ reason: "fail" });
          });
        }}
      />

      {/* Only once there is something above it to divide from. */}
      {available ? (
        <div className="flex items-center gap-4">
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="text-sm leading-[1.3] font-medium text-natural-500">{t("orCard")}</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      {ready || (
        <span className="sr-only" role="status">
          {t("preparing")}
        </span>
      )}
    </div>
  );
}
