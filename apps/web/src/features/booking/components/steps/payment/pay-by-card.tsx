"use client";

import { PaymentElement } from "@stripe/react-stripe-js";
import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import { Shield, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";

import type { BookingValues } from "../../../lib/booking-form";
import ExpressCheckout from "./express-checkout";

/**
 * `enabled` is false when Stripe has no publishable key. The panel then says so rather
 * than rendering a PaymentElement with no provider above it — `<Elements>` is only
 * mounted on the configured path.
 */
export default function PayByCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("Booking.payment.card");
  const { control } = useFormContext<BookingValues>();
  const guest = useWatch({ control, name: "guestDetails" });

  if (!enabled) {
    return (
      <Notification variant="warning" icon={<TriangleAlert />}>
        {t("unavailable")}
      </Notification>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ExpressCheckout />

      {/*
        Step 1 already asked for the payer's name, email and country, so they are seeded here
        instead of being collected twice. Stripe still shows whichever billing fields the
        chosen payment method actually requires.
      */}
      <PaymentElement
        options={{
          /*
           * Accordion rather than tabs: the tab strip truncates once more than a few
           * methods are eligible, and the set is a Dashboard decision that can grow
           * without warning. `radios: "never"` drops the selection circles — the
           * expanded item is already the selection — and the spacing carries the
           * grouping instead of a border.
           */
          layout: {
            type: "accordion",
            defaultCollapsed: false,
            radios: "never",
            spacedAccordionItems: true,
          },
          defaultValues: {
            billingDetails: {
              name: guest.fullName,
              email: guest.email,
              phone: guest.phone,
              address: { country: guest.countryCode || undefined },
            },
          },
        }}
      />

      <Notification icon={<Shield />}>{t("notice")}</Notification>
    </div>
  );
}
