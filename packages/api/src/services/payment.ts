import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { env } from "@yacht-charter/env/server";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import type { z } from "zod";

import type { Database } from "../context";
import type { checkoutConfirmSchema } from "../contracts/booking";
import { readOwnedBooking } from "./booking-read";
import { isPreConfirmed, type BookingStatus } from "./booking-state";
import { assertHoldStillValid, assertIntentIsResumable, assertPayable } from "./payment-guards";
import { amountDue, outstandingMinor } from "./checkout-amounts";
import { assertQuoteIsFresh } from "./quote";

type ConfirmResult = z.infer<typeof checkoutConfirmSchema>;

let client: Stripe | null = null;

/**
 * Null when STRIPE_SECRET_KEY is unset. Card checkout then reports NOT_IMPLEMENTED
 * instead of the server failing to boot, so the invoice and enquiry paths keep
 * working without payment credentials.
 */
export function stripeClient(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  // No apiVersion override: the SDK pins the version it was built against, and
  // hardcoding an older one here would silently drift from the typings.
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Creates the PaymentIntent for a booking and moves it to PAYMENT_PENDING.
 *
 * The quote is re-validated first: past its expiry, or with a moved provider
 * price, the customer must reprice rather than being charged an amount they were
 * never shown (§6.2).
 */
export async function confirmCheckout(
  db: Database,
  userId: string,
  bookingId: string,
  preference: "deposit" | "full",
): Promise<ConfirmResult> {
  const stripe = stripeClient();
  if (!stripe) {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "Card payment is not configured — set STRIPE_SECRET_KEY to enable it",
    });
  }

  const row = await readOwnedBooking(db, userId, bookingId);

  const current = row.booking.status;

  /*
   * Both freshness checks apply only while the booking is still on its way to being
   * paid. Once the money is in, neither the quote's expiry nor the provider hold
   * says anything useful: they will both have lapsed in time, and answering a paid
   * booking with "reprice before paying" describes the wrong problem. Past that
   * point the reuse path and `assertPayable` below give the real answer.
   */
  if (isPreConfirmed(current)) {
    // The quote was consumed by createHold, so read it directly rather than through
    // the active-quote guard.
    await assertPriceStillValid(row.quote.expiresAt);
    assertHoldStillValid(row.booking.holdExpiresAt, new Date());
  }

  // The key carries the amount, so a repriced booking gets a new intent rather
  // than silently reusing one for a figure the customer never saw. Keep this
  // after amountMinor is computed.
  const amountMinor = amountDue(row.quote, preference);
  const kind = preference === "full" ? ("full" as const) : ("deposit" as const);
  const idempotencyKey = `pay:${bookingId}:${kind}:${amountMinor}`;

  /*
   * Before the transition guard, not after. A customer who abandoned a 3-D Secure
   * challenge or lost the connection mid-confirm left the booking in
   * PAYMENT_PENDING with a live intent, and PAYMENT_PENDING is not a legal move to
   * itself — asserting first turned every such retry into a 500 and made this
   * branch, which exists precisely for the retry, unreachable.
   */
  const reused = await reuseIntent(db, stripe, bookingId, current, idempotencyKey);
  if (reused) return reused;

  assertPayable(current);

  const intent = await stripe.paymentIntents.create(intentParams(row.booking, kind, amountMinor), {
    idempotencyKey,
  });

  const paymentId = await recordIntent(db, {
    bookingId,
    from: current,
    kind,
    amountMinor,
    currency: row.booking.currency,
    stripePaymentIntentId: intent.id,
    idempotencyKey,
  });

  if (!paymentId) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return present({
    bookingId,
    status: "PAYMENT_PENDING",
    paymentId,
    amountMinor,
    currency: row.booking.currency,
    kind,
    intent,
  });
}

/**
 * Charges what is still owed on a confirmed charter.
 *
 * The deposit policy only works if the rest can be collected: a 50% booking that
 * confirms and then has no way to take the other half leaves the money to be chased
 * by hand. This is that second call, and it is deliberately not `checkout.confirm`
 * — the booking is already CONFIRMED and must stay that way, because the charter
 * exists whether or not this payment has landed yet.
 */
export async function payBalance(
  db: Database,
  userId: string,
  bookingId: string,
): Promise<ConfirmResult> {
  const stripe = stripeClient();
  if (!stripe) {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "Card payment is not configured — set STRIPE_SECRET_KEY to enable it",
    });
  }

  const row = await readOwnedBooking(db, userId, bookingId);

  /*
   * Only once the charter is real. Before that the deposit is what is owed and
   * `checkout.confirm` is the call; after a cancellation or refund there is nothing
   * left to settle.
   */
  if (row.booking.status !== "CONFIRMED") {
    throw new ORPCError("CONFLICT", {
      message: `A booking in ${row.booking.status} has no balance to settle`,
      data: { code: "NOT_PAYABLE" },
    });
  }

  const outstanding = await outstandingBalance(db, bookingId, row.quote);

  if (outstanding <= 0) {
    throw new ORPCError("CONFLICT", {
      message: "This booking is already paid in full",
      data: { code: "ALREADY_PAID" },
    });
  }

  const idempotencyKey = `pay:${bookingId}:balance:${outstanding}`;

  const reused = await reuseIntent(db, stripe, bookingId, row.booking.status, idempotencyKey);
  if (reused) return reused;

  const intent = await stripe.paymentIntents.create(
    intentParams(row.booking, "balance", outstanding),
    { idempotencyKey },
  );

  const paymentId = await recordIntent(db, {
    bookingId,
    // Null: a balance payment moves no status. The booking is CONFIRMED and stays
    // CONFIRMED whether this charge lands now, later, or not at all.
    from: null,
    kind: "balance",
    amountMinor: outstanding,
    currency: row.booking.currency,
    stripePaymentIntentId: intent.id,
    idempotencyKey,
  });

  if (!paymentId) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return present({
    bookingId,
    status: row.booking.status,
    paymentId,
    amountMinor: outstanding,
    currency: row.booking.currency,
    kind: "balance",
    intent,
  });
}

/** Sums the money that actually arrived, then weighs it against the quote. */
async function outstandingBalance(
  db: Database,
  bookingId: string,
  priced: Parameters<typeof outstandingMinor>[0],
): Promise<number> {
  const settled = await db
    .select({ amountMinor: payment.amountMinor })
    .from(payment)
    .where(and(eq(payment.bookingId, bookingId), eq(payment.status, "succeeded")));

  return outstandingMinor(
    priced,
    settled.reduce((total, row) => total + row.amountMinor, 0),
  );
}

type BookingRow = typeof booking.$inferSelect;

/**
 * What every charge for a booking sends to Stripe.
 *
 * `payment_method_types` is deliberately absent: omitting it is what enables dynamic
 * payment methods, so which ones appear is a Dashboard decision rather than one
 * frozen into this file.
 */
function intentParams(
  row: BookingRow,
  kind: "deposit" | "balance" | "full",
  amountMinor: number,
): Stripe.PaymentIntentCreateParams {
  const params: Stripe.PaymentIntentCreateParams = {
    amount: amountMinor,
    currency: row.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    // Shown on the receipt and in the Dashboard, where "€1,224" alone identifies nothing.
    description: `${row.commercialSnapshot.listingTitle} (${row.reference})`,
    // The webhook is authoritative and looks the booking up by these.
    metadata: { bookingId: row.id, kind, reference: row.reference },
  };

  /*
   * Stripe emails the receipt itself once this is set, which is the only confirmation
   * the customer currently gets for a card payment.
   */
  if (row.guestEmail) params.receipt_email = row.guestEmail;

  const suffix = statementSuffix(row.reference);
  if (suffix) params.statement_descriptor_suffix = suffix;

  return params;
}

/**
 * The half of the card statement line we control. A charter is booked months before
 * it sails and the charge is long forgotten by then, so carrying the reference is
 * what lets a customer recognise it instead of disputing it.
 *
 * Stripe caps the descriptor and its suffix at 22 characters together and rejects
 * punctuation, so this takes the distinctive tail of the reference rather than
 * risking the account prefix pushing a longer one over the limit.
 */
function statementSuffix(reference: string): string | undefined {
  const tail = reference.split("-").at(-1) ?? reference;
  const safe = tail.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 10);

  // Stripe requires at least one letter; an all-digit suffix is refused.
  return /[A-Za-z]/.test(safe) ? safe : undefined;
}

/**
 * Reuse the existing intent when the customer retries the same amount, so a
 * double-click cannot open two charges for one booking. The booking's status is
 * whatever it already was — this path advances nothing.
 *
 * Null means there is nothing to resume and the caller should open a new intent.
 */
async function reuseIntent(
  db: Database,
  stripe: Stripe,
  bookingId: string,
  status: ConfirmResult["status"],
  idempotencyKey: string,
): Promise<ConfirmResult | null> {
  const [existing] = await db
    .select()
    .from(payment)
    .where(eq(payment.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existing?.stripePaymentIntentId) return null;

  const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);

  assertIntentIsResumable(intent.status);

  return present({
    bookingId,
    status,
    paymentId: existing.id,
    amountMinor: existing.amountMinor,
    currency: existing.currency,
    kind: existing.kind,
    intent,
  });
}

/**
 * Schedule, payment and — for the charge that starts a checkout — the booking's move
 * to PAYMENT_PENDING, in one transaction.
 *
 * `from` is null for a balance payment on an already-confirmed booking, which records
 * the money without touching the status.
 */
async function recordIntent(
  db: Database,
  input: {
    bookingId: string;
    from: BookingStatus | null;
    kind: "deposit" | "balance" | "full";
    amountMinor: number;
    currency: string;
    stripePaymentIntentId: string;
    idempotencyKey: string;
  },
): Promise<string | undefined> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(paymentSchedule)
      .values({
        bookingId: input.bookingId,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
      })
      .returning({ id: paymentSchedule.id });

    const [created] = await tx
      .insert(payment)
      .values({
        bookingId: input.bookingId,
        scheduleId: schedule?.id ?? null,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "requires_payment",
        stripePaymentIntentId: input.stripePaymentIntentId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: payment.id });

    if (input.from) {
      await tx
        .update(booking)
        .set({ status: "PAYMENT_PENDING" })
        .where(and(eq(booking.id, input.bookingId), eq(booking.status, input.from)));
    }

    return created?.id;
  });
}

function present(input: {
  bookingId: string;
  status: ConfirmResult["status"];
  paymentId: string;
  amountMinor: number;
  currency: string;
  kind: ConfirmResult["kind"];
  intent: Stripe.PaymentIntent;
}): ConfirmResult {
  return {
    bookingId: input.bookingId,
    status: input.status,
    paymentId: input.paymentId,
    amount: { amountMinor: input.amountMinor, currency: input.currency },
    kind: input.kind,
    clientSecret: input.intent.client_secret ?? "",
  };
}

async function assertPriceStillValid(expiresAt: Date): Promise<void> {
  if (expiresAt > new Date()) return;
  throw new ORPCError("CONFLICT", {
    message: "Quote has expired — reprice before paying",
    data: { code: "QUOTE_EXPIRED" },
  });
}

// Re-exported so the webhook route in apps/server does not import the quote
// service directly just to reach this guard.
export { assertQuoteIsFresh };
