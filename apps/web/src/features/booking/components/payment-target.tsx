"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { PayBookingInput } from "../hooks/use-pay-booking";

/*
 * What the payment surface is collecting money for.
 *
 * The card form and the wallet buttons sit in different parts of the tree — one inside
 * the tab panel, one in the step footer — so passing this down as props would thread it
 * through the tabs for no reason. Provided once alongside `<Elements>`, which is the
 * same boundary those components already require.
 *
 * Two installments use it: the deposit at checkout, and the balance on its own page.
 */
const PaymentTargetContext = createContext<PayBookingInput | null>(null);

export function PaymentTargetProvider({
  value,
  children,
}: {
  value: PayBookingInput;
  children: ReactNode;
}) {
  return <PaymentTargetContext.Provider value={value}>{children}</PaymentTargetContext.Provider>;
}

export function usePaymentTarget(): PayBookingInput {
  const value = useContext(PaymentTargetContext);
  if (!value) throw new Error("usePaymentTarget must be used within <PaymentTargetProvider>");
  return value;
}
