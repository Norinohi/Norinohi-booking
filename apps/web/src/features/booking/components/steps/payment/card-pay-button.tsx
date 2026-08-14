"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { useState } from "react";

import { usePayBooking } from "../../../hooks/use-pay-booking";

/**
 * Pays with the details held in the PaymentElement above it.
 *
 * Rendered only inside `<Elements>` — the hook's `useStripe`/`useElements` throw
 * without that provider — which is why the unconfigured path keeps the plain button
 * in the parent.
 */
export default function CardPayButton({ label }: { label: string }) {
  const { pay, ready } = usePayBooking();
  const [paying, setPaying] = useState(false);

  async function submit() {
    setPaying(true);
    try {
      await pay();
    } finally {
      setPaying(false);
    }
  }

  return (
    <Button
      variant="brand"
      className="h-13 w-full"
      loading={paying}
      disabled={!ready}
      onClick={() => void submit()}
    >
      {label}
    </Button>
  );
}
