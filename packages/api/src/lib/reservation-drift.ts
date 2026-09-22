import type { BookingStatus } from "../services/booking-state";

/**
 * Whether our record of a charter and the operator's have come apart.
 *
 * Kept away from the pass that uses it for the same reason `refusal-report.ts` is: this is the
 * judgement somebody gets woken for, and it is worth being able to test it without a database
 * behind it.
 *
 * A vendor cancellation under a live booking is named apart from the rest, because that is the
 * one that costs a customer their holiday. So is a hold that ran out at the vendor while we
 * still count on it, which nobody cancelled and which Booking Manager goes on blocking the week
 * for. The rest is drift worth an operator's eye: a hold the vendor confirmed behind our back,
 * or a confirmed charter it has put back on hold.
 *
 * A booking mid-flight through our own confirm is not drift. The vendor is answering about the
 * reservation we are in the middle of changing, and reporting that would be noise on every
 * checkout.
 */
export type ProviderReservationStatus = "option_held" | "confirmed" | "cancelled";
export type DriftKind =
  | "cancelled_by_operator"
  | "option_lapsed"
  | "status_drift"
  | "dates_changed"
  | "yacht_changed"
  | "price_changed";

export function driftKindOf(
  ours: BookingStatus,
  theirs: ProviderReservationStatus,
  lapsed = false,
): DriftKind | null {
  if (theirs === "cancelled") return lapsed ? "option_lapsed" : "cancelled_by_operator";
  if (ours === "CONFIRMING") return null;
  if (theirs === "confirmed" && ours === "OPTION_HELD") return "status_drift";
  if (theirs === "option_held" && ours === "CONFIRMED") return "status_drift";
  return null;
}

/** What we sold: the quote's dates, and the yacht and price the vendor held it at. */
export interface DriftBaseline {
  checkIn: string;
  checkOut: string;
  externalYachtId: string | null;
  priceMinor: number | null;
  currency: string | null;
}

/** The vendor's current record of the same reservation, as far as it said. */
export interface ReportedReservation {
  status: ProviderReservationStatus;
  externalYachtId?: string | undefined;
  checkIn?: string | undefined;
  checkOut?: string | undefined;
  priceMinor?: number | undefined;
  currency?: string | undefined;
}

/**
 * The changes an operator can make under a live booking without cancelling it: another week,
 * another hull, another price. The customer's booking keeps what they bought, so each is
 * reported for a person to take up with the operator; none is applied.
 *
 * Only what both sides state is compared. A cancelled reservation is reported as that alone,
 * and a price in another currency than the one held is not a price change.
 */
export function detailDriftOf(
  baseline: DriftBaseline,
  theirs: ReportedReservation,
): { kind: DriftKind; detail: string }[] {
  if (theirs.status === "cancelled") return [];
  const drift: { kind: DriftKind; detail: string }[] = [];

  const checkIn = theirs.checkIn ?? baseline.checkIn;
  const checkOut = theirs.checkOut ?? baseline.checkOut;
  if (checkIn !== baseline.checkIn || checkOut !== baseline.checkOut) {
    drift.push({
      kind: "dates_changed",
      detail: `${baseline.checkIn}..${baseline.checkOut} -> ${checkIn}..${checkOut}`,
    });
  }

  if (
    baseline.externalYachtId !== null &&
    theirs.externalYachtId !== undefined &&
    theirs.externalYachtId !== baseline.externalYachtId
  ) {
    drift.push({
      kind: "yacht_changed",
      detail: `yacht ${baseline.externalYachtId} -> ${theirs.externalYachtId}`,
    });
  }

  if (
    baseline.priceMinor !== null &&
    theirs.priceMinor !== undefined &&
    baseline.currency !== null &&
    theirs.currency === baseline.currency &&
    theirs.priceMinor !== baseline.priceMinor
  ) {
    drift.push({
      kind: "price_changed",
      detail: `${baseline.priceMinor} -> ${theirs.priceMinor} ${baseline.currency} (minor units)`,
    });
  }

  return drift;
}
