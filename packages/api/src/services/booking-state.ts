/*
 * The booking state machine from docs/backend-architecture.md §6, expressed as data
 * so every transition is checked in one place rather than re-derived at each call
 * site. Nothing outside this module should assign booking.status directly.
 */

export type BookingStatus =
  | "DRAFT"
  | "QUOTED"
  | "OPTION_PENDING"
  | "OPTION_HELD"
  | "PAYMENT_PENDING"
  | "CONFIRMING"
  | "CONFIRMED"
  | "QUOTE_EXPIRED"
  | "OPTION_EXPIRED"
  | "PAYMENT_FAILED"
  | "PROVIDER_REJECTED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

/** Anything not yet CONFIRMED can be cancelled by the user or an admin (§6). */
const PRE_CONFIRMED: readonly BookingStatus[] = [
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
];

const TRANSITIONS = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["OPTION_PENDING", "PAYMENT_PENDING", "QUOTE_EXPIRED", "CANCELLED"],
  // QUOTE_EXPIRED covers an option request that never came back — the process died
  // between asking the provider and hearing an answer. Such a booking holds no
  // option (provider_option_id and hold_expires_at are both still null), so the
  // sweeper reaches it through the quote, not the hold, and OPTION_EXPIRED would
  // claim a hold lapsed that was never obtained.
  OPTION_PENDING: [
    "OPTION_HELD",
    "OPTION_EXPIRED",
    "QUOTE_EXPIRED",
    "PROVIDER_REJECTED",
    "CANCELLED",
  ],
  OPTION_HELD: ["PAYMENT_PENDING", "OPTION_EXPIRED", "CANCELLED"],
  // A failed payment can be retried, which returns the booking to PAYMENT_PENDING.
  PAYMENT_PENDING: ["CONFIRMING", "PAYMENT_FAILED", "QUOTE_EXPIRED", "OPTION_EXPIRED", "CANCELLED"],
  CONFIRMING: ["CONFIRMED", "PROVIDER_REJECTED"],
  // Terminal for the happy path: a confirmed booking is cancelled by admin only,
  // which goes through the refund branch.
  CONFIRMED: ["REFUND_PENDING", "CANCELLED"],
  QUOTE_EXPIRED: ["QUOTED", "CANCELLED"],
  OPTION_EXPIRED: ["QUOTED", "CANCELLED"],
  // A failed payment is retryable, and expires the same way an unfinished one does.
  // Not to CANCELLED, which §6 originally named: that is terminal, and a declined
  // card is a customer who should still be able to come back and reprice.
  PAYMENT_FAILED: ["PAYMENT_PENDING", "OPTION_EXPIRED", "QUOTE_EXPIRED", "CANCELLED"],
  PROVIDER_REJECTED: ["REFUND_PENDING", "CANCELLED"],
  CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
} satisfies Record<BookingStatus, readonly BookingStatus[]>;

/*
 * Never reached the customer as a booking: the provider refused or the hold ran out before
 * anything was secured, and no money moved. The rows are kept - they carry the consents, the
 * idempotency key and the vendor's reason - but a failed submit must not leave a card in the
 * customer's history, and `checkout.createHold` must not replay one as a hold. Asking for one
 * of these statuses explicitly still returns it, which is how support and admin see what was
 * attempted.
 *
 * A claim about the table above, and tested against it: none of these can reach
 * PAYMENT_PENDING, so a customer sent onward with one could only ever be refused at the
 * payment step. The way out of all four is a reprice.
 */
export const NEVER_HELD: readonly BookingStatus[] = [
  "DRAFT",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PROVIDER_REJECTED",
];

/*
 * What the expiry sweeper moves, and to what.
 *
 * These live here rather than in expiry.ts because they are claims about
 * transitions and have to answer to the table above. Kept apart, they drifted:
 * the sweeper picked OPTION_PENDING with a SQL filter and wrote QUOTE_EXPIRED
 * with a literal, and neither half was visibly wrong on its own.
 */
export const HOLD_SWEEP = {
  from: ["OPTION_HELD", "OPTION_PENDING"],
  to: "OPTION_EXPIRED",
} as const satisfies SweepSpec;

export const DEAD_QUOTE_SWEEP = {
  from: ["QUOTED", "OPTION_PENDING"],
  to: "QUOTE_EXPIRED",
} as const satisfies SweepSpec;

/**
 * Checkouts abandoned at the payment step.
 *
 * The other two sweeps leave both of these alone because money may be in flight, which is
 * right in the minutes after Pay and wrong a week later: nothing else moves these states, so an
 * abandoned checkout used to hold its provider option against every future booking of that
 * slot. The expiry service is what decides a booking has waited long enough.
 *
 * PAYMENT_FAILED is here for the same reason and not as an afterthought: a declined card leaves
 * a customer in exactly the position a closed tab does, holding the option with a live pay link,
 * and it was the last state nothing could move a booking out of. Its clock runs off `updated_at`,
 * so each retry starts the wait again.
 *
 * Two destinations, because the reason has to be true. A booking that held an option expired
 * the option; one whose provider grants none never had a hold to lapse, and only its quote can
 * be said to have run out.
 */
export const STALE_PAYMENT_SWEEP = {
  from: ["PAYMENT_PENDING", "PAYMENT_FAILED"],
  to: "QUOTE_EXPIRED",
  held: "OPTION_EXPIRED",
} as const satisfies SweepSpec & { held: BookingStatus };

/**
 * The states the "we're holding your yacht" mail is true of.
 *
 * Not a sweep, but here for the same reason the sweeps are: it is a claim about states, and
 * a copy of it kept next to the sender would drift the first time the table changed. The mail
 * says three things — the slot is held, nothing has been charged, finish your payment — and
 * every state outside this list falsifies at least one of them. It matters because the mail is
 * queued rather than sent: `createHold` enqueues it, and by the time a retry gets its turn the
 * booking may have been paid, confirmed, cancelled or expired out from under it.
 *
 * CONFIRMING is out even though nothing has settled there: the money is with the provider and
 * the confirmation mail is a moment away, so "complete your payment" is the wrong thing to say.
 * PAYMENT_PENDING and PAYMENT_FAILED are in — an opened payment is not an arrived one and a
 * declined card is not a charge, and the pay link that mail carries is the thing both of those
 * customers need. Every expired and rejected state is out: there is no hold left to write to
 * anyone about, which is the whole reason the sweeps move a booking there.
 */
export const BOOKING_RECEIVED_STATES = [
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
] as const satisfies readonly BookingStatus[];

type SweepSpec = { from: readonly BookingStatus[]; to: BookingStatus };

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  const allowed: readonly BookingStatus[] = TRANSITIONS[from];
  return allowed.includes(to);
}

export function isPreConfirmed(status: BookingStatus): boolean {
  return PRE_CONFIRMED.includes(status);
}

/** A booking the customer may still cancel themselves, without an admin. */
export function isUserCancellable(status: BookingStatus): boolean {
  return isPreConfirmed(status);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Cannot move a booking from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
