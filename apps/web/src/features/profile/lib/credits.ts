import type { CreditLedgerKind } from "../types";

/*
 * Earned money reads as an award, spent money as a fact, and credit that ran out or was
 * corrected by staff reads as neither — the muted outline keeps an expiry from looking like
 * something the customer did.
 */
const KIND_VARIANT = {
  referral_reward: "brand",
  booking_redemption: "neutral",
  expiry: "outline",
  adjustment: "outline",
} as const;

export function creditKindVariant(kind: CreditLedgerKind) {
  return KIND_VARIANT[kind];
}
