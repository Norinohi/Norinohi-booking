import type { BookingStatus } from "../services/booking-state";

/**
 * Whether our record of a charter and the operator's have come apart.
 *
 * Kept away from the pass that uses it for the same reason `refusal-report.ts` is: this is the
 * judgement somebody gets woken for, and it is worth being able to test it without a database
 * behind it.
 *
 * A vendor cancellation under a live booking is named apart from the rest, because that is the
 * one that costs a customer their holiday. The rest is drift worth an operator's eye: a hold
 * the vendor confirmed behind our back, or a confirmed charter it has put back on hold.
 *
 * A booking mid-flight through our own confirm is not drift. The vendor is answering about the
 * reservation we are in the middle of changing, and reporting that would be noise on every
 * checkout.
 */
export type ProviderReservationStatus = "option_held" | "confirmed" | "cancelled";
export type DriftKind = "cancelled_by_operator" | "status_drift";

export function driftKindOf(
  ours: BookingStatus,
  theirs: ProviderReservationStatus,
): DriftKind | null {
  if (theirs === "cancelled") return "cancelled_by_operator";
  if (ours === "CONFIRMING") return null;
  if (theirs === "confirmed" && ours === "OPTION_HELD") return "status_drift";
  if (theirs === "option_held" && ours === "CONFIRMED") return "status_drift";
  return null;
}
