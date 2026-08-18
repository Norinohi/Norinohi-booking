import { ORPCError } from "@orpc/server";
import {
  booking,
  bookingConsent,
  bookingExtra,
  payment,
  paymentSchedule,
  providerReservationEvent,
  type CommercialSnapshot,
} from "@yacht-charter/db/schema/booking";
import { base } from "@yacht-charter/db/schema/geography";
import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { user } from "@yacht-charter/db/schema/auth";
import { quote, type QuoteLine } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider, ProviderReservation } from "@yacht-charter/providers";
import { and, count, desc, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import { badgesFor } from "../presenters/listing";
import type {
  bookingCancelSchema,
  consentsSchema,
  guestDetailsSchema,
  bookingDetailSchema,
  bookingListInputSchema,
  bookingListSchema,
  bookingSummarySchema,
  checkoutHoldSchema,
  checkoutStatusSchema,
} from "../contracts/booking";
import {
  assertTransition,
  InvalidTransitionError,
  isUserCancellable,
  type BookingStatus,
} from "./booking-state";
import { readAnyBooking, readOwnedBooking } from "./booking-read";
import { notifyBookingCancelled, notifyBookingReceived } from "./booking-email";
import { amountDue, atCheckInMinor, outstandingMinor, payableNowFor } from "./checkout-amounts";
import { redeemDiscount } from "./discount-redemption";
import { redeemCredit } from "./loyalty";
import { paginatedQuery, totalFrom } from "./pagination";
import { isUniqueViolation } from "./pg-errors";
import { randomCode, withUniqueRetry } from "./random-code";
import { asCrewType, assertQuoteIsFresh } from "./quote";
import type { GuestAccessToken } from "./guest-access";

type ListInput = z.infer<typeof bookingListInputSchema>;

type ListResult = z.infer<typeof bookingListSchema>;
type Summary = z.infer<typeof bookingSummarySchema>;
type Detail = z.infer<typeof bookingDetailSchema>;
type Hold = z.infer<typeof checkoutHoldSchema>;
type Status = z.infer<typeof checkoutStatusSchema>;
type CancelResult = z.infer<typeof bookingCancelSchema>;
type GuestDetails = z.infer<typeof guestDetailsSchema>;
type Consents = z.infer<typeof consentsSchema>;

/**
 * Stamped onto every consent row. Bump this whenever the terms or the cancellation
 * policy text changes, so an old acceptance is never mistaken for the current one.
 */
const POLICY_VERSION = "2026-08-01";

type BookingRow = typeof booking.$inferSelect;

const REFERENCE_LENGTH = 8;

/* --------------------------------------------------------------------- reads */

/*
 * Never reached the customer as a booking: the provider refused or the hold ran out before
 * anything was secured, and no money moved. The rows are kept — they carry the consents, the
 * idempotency key and the vendor's reason — but a failed submit must not leave a card in the
 * customer's history. Asking for one of these statuses explicitly still returns it, which is
 * how support and admin see what was attempted.
 */
const NEVER_HELD: BookingStatus[] = [
  "DRAFT",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PROVIDER_REJECTED",
];

export async function listBookings(
  db: Database,
  userId: string,
  input: ListInput,
): Promise<ListResult> {
  const filters = [eq(booking.userId, userId)];
  if (input.status?.length) {
    filters.push(inArray(booking.status, input.status));
  } else {
    filters.push(notInArray(booking.status, NEVER_HELD));
  }

  // The date filter is on the charter period, which lives on the quote — that is
  // what "Any dates" means on a history screen, not when the booking was made.
  const dateFilters = [];
  if (input.from) dateFilters.push(gte(quote.checkOut, input.from));
  if (input.to) dateFilters.push(lte(quote.checkIn, input.to));

  const where = and(...filters, ...dateFilters);

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({ booking, quote })
        .from(booking)
        .innerJoin(quote, eq(quote.id, booking.quoteId))
        .where(where)
        .orderBy(desc(booking.createdAt), desc(booking.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(
        await db
          .select({ totalItems: count() })
          .from(booking)
          .innerJoin(quote, eq(quote.id, booking.quoteId))
          .where(where),
      ),
  });

  const money = await loadMoney(
    db,
    rows.map((row) => row.booking.id),
  );

  return {
    items: rows.map((row) => presentSummary(row.booking, row.quote, money.get(row.booking.id))),
    pagination,
  };
}

export async function getBooking(db: Database, userId: string, id: string): Promise<Detail> {
  const row = await readOwnedBooking(db, userId, id);

  const [extras, schedules, payments, money] = await Promise.all([
    db.select().from(bookingExtra).where(eq(bookingExtra.bookingId, id)),
    db.select().from(paymentSchedule).where(eq(paymentSchedule.bookingId, id)),
    db.select().from(payment).where(eq(payment.bookingId, id)),
    loadMoney(db, [id]),
  ]);

  const summary = presentSummary(row.booking, row.quote, money.get(id));

  return {
    ...summary,
    provider: row.booking.provider,
    providerReservationId: row.booking.providerReservationId,
    crewListLink: row.booking.crewListLink,
    holdExpiresAt: row.booking.holdExpiresAt?.toISOString() ?? null,
    confirmedAt: row.booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.booking.cancelledAt?.toISOString() ?? null,
    cancelReason: row.booking.cancelReason,
    crewType: row.quote.crewType,
    priceLines: row.quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
      group: line.group ?? null,
      payWhen: line.payWhen,
    })),
    extras: extras.map((extra) => ({
      code: extra.code,
      label: extra.label,
      pricingType: extra.pricingType,
      amount:
        extra.amountMinor === null
          ? null
          : { amountMinor: extra.amountMinor, currency: extra.currency ?? row.booking.currency },
    })),
    paymentPolicy: {
      mode: row.quote.paymentPolicy.mode,
      depositPct: row.quote.paymentPolicy.depositPct,
      balanceDueAt: row.quote.paymentPolicy.balanceDueAt ?? null,
    },
    dueNow: {
      amountMinor: amountDue(row.quote, row.quote.paymentPolicy.mode),
      currency: row.booking.currency,
    },
    paymentSchedule: schedules.map((schedule) => ({
      id: schedule.id,
      kind: schedule.kind,
      amount: { amountMinor: schedule.amountMinor, currency: schedule.currency },
      dueAt: schedule.dueAt?.toISOString() ?? null,
      status: schedule.status,
    })),
    payments: payments.map((row_) => ({
      id: row_.id,
      kind: row_.kind,
      amount: { amountMinor: row_.amountMinor, currency: row_.currency },
      status: row_.status,
      paidAt: row_.paidAt?.toISOString() ?? null,
      // Same test `planRefund` makes: an intent id is what a card payment is.
      method: row_.stripePaymentIntentId ? ("card" as const) : ("transfer" as const),
      disputedAt: row_.disputedAt?.toISOString() ?? null,
      disputeStatus: row_.disputeStatus,
    })),
  };
}

export async function getCheckoutStatus(db: Database, userId: string, id: string): Promise<Status> {
  const row = await readOwnedBooking(db, userId, id);

  const [lastFailure] = await db
    .select({ failureReason: payment.failureReason })
    .from(payment)
    .where(and(eq(payment.bookingId, id), eq(payment.status, "failed")))
    .orderBy(desc(payment.createdAt))
    .limit(1);

  return {
    bookingId: row.booking.id,
    reference: row.booking.reference,
    status: row.booking.status,
    holdExpiresAt: row.booking.holdExpiresAt?.toISOString() ?? null,
    confirmedAt: row.booking.confirmedAt?.toISOString() ?? null,
    providerReservationId: row.booking.providerReservationId,
    failureReason: row.booking.cancelReason ?? lastFailure?.failureReason ?? null,
  };
}

/* ------------------------------------------------------------------ mutation */

/**
 * Who is checking out. A guest has an account — provisioned for them at the edge —
 * but no session, so the booking additionally stores the hash of the token that is
 * their only way back to it.
 */
export type CheckoutActor = {
  userId: string;
  /** Null for a signed-in customer, whose session already authorises the follow-ups. */
  guestAccess: GuestAccessToken | null;
};

/**
 * Turns a fresh quote into a booking, holding a provider option when the provider
 * supports one. Idempotent on `idempotencyKey`: a retried submit returns the
 * booking the first call created rather than holding a second option (§6.2).
 */
export async function createHold(
  db: Database,
  provider: InventoryProvider,
  actor: CheckoutActor,
  quoteId: string,
  idempotencyKey: string,
  guest: GuestDetails,
  consents: Consents,
): Promise<Hold> {
  const userId = actor.userId;
  const existing = await findHoldByKey(db, userId, idempotencyKey);
  if (existing) {
    const reissued = await rehashGuestAccess(db, existing, actor);
    return presentHold(reissued.row, reissued.applied ? (actor.guestAccess?.token ?? null) : null);
  }

  const priced = await assertQuoteIsFresh(db, quoteId);
  if (priced.userId && priced.userId !== userId) {
    throw new ORPCError("FORBIDDEN", { message: "Quote belongs to another user" });
  }

  const snapshot = await buildSnapshot(db, priced.listingId);
  const [account] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!account) throw new ORPCError("NOT_FOUND", { message: "Unknown user" });

  // Created from a validated quote, so the booking starts at QUOTED. DRAFT exists
  // in the §6 enum for a booking with no quote yet, which this flow never produces.
  const created = await insertBooking(db, {
    quoteId: priced.id,
    status: "QUOTED",
    guestFullName: guest.fullName,
    guestEmail: guest.email,
    guestPhone: guest.phone,
    guestCountryCode: guest.countryCode,
    specialRequests: guest.specialRequests ?? null,
    userId,
    listingId: priced.listingId,
    provider: priced.provider,
    totalMinor: priced.totalMinor,
    currency: priced.currency,
    commercialSnapshot: snapshot,
    guestAccessTokenHash: actor.guestAccess?.tokenHash ?? null,
    idempotencyKey,
  });

  // The quote is now spoken for; a second booking must not be built from it.
  await db.update(quote).set({ userId, status: "consumed" }).where(eq(quote.id, priced.id));

  await recordConsents(db, created.id, consents);
  await copyQuoteExtras(db, created.id, priced.lines);

  // Quoting is public and must never consume a code, so the usage limit only
  // becomes binding here. Re-checked under the transaction so two simultaneous
  // checkouts cannot both take the last remaining use.
  const redeem = () => redeemFor(db, created.id, userId, priced);

  const token = actor.guestAccess?.token ?? null;

  const announce = (row: BookingRow) =>
    notifyBookingReceived({
      to: guest.email,
      guestName: guest.fullName,
      bookingId: row.id,
      reference: row.reference,
      snapshot,
      priced,
      outstandingMinor: outstandingMinor(priced, 0),
      holdExpiresAt: row.holdExpiresAt,
      isGuest: actor.guestAccess !== null,
    });

  // No option support: nothing to secure, so the booking waits at QUOTED and the
  // payment is what commits it.
  if (!provider.capabilities().supportsOptions) {
    await redeem();
    await announce(created);
    return presentHold(created, token);
  }

  /*
   * After the option rather than before it, because the mail tells the customer how long
   * the slot is theirs and that date does not exist until the provider answers. A refusal
   * throws out of holdOption, which is also the right moment to send nothing: there is no
   * hold to write to them about.
   */
  const held = await holdOption(db, provider, created, priced, account, redeem);
  await announce(held);

  return presentHold(held, token);
}

/**
 * A retried submit returns the booking the first call created rather than holding
 * a second option (§6.2).
 *
 * Scoped to the customer, because the key comes from the client: two people whose
 * browsers derive the same key must each get their own booking. Matching globally
 * meant the second one was refused outright and could not check out at all, and it
 * made the endpoint an oracle for whether a given key existed.
 */
/**
 * A retried guest submit arrives from a browser holding a token nobody kept a copy
 * of, so the stored hash is replaced with the one this attempt minted.
 *
 * Refused unless the booking was itself a guest checkout. The email decides which
 * account a guest acts as, so without that guard someone who typed a registered
 * address and hit the right idempotency key would be handed a live token for a
 * booking that customer made while signed in.
 */
async function rehashGuestAccess(
  db: Database,
  existing: BookingRow,
  actor: CheckoutActor,
): Promise<{ row: BookingRow; applied: boolean }> {
  if (!actor.guestAccess || !existing.guestAccessTokenHash)
    return { row: existing, applied: false };

  const [updated] = await db
    .update(booking)
    .set({ guestAccessTokenHash: actor.guestAccess.tokenHash })
    .where(eq(booking.id, existing.id))
    .returning();

  return updated ? { row: updated, applied: true } : { row: existing, applied: false };
}

async function findHoldByKey(
  db: Database,
  userId: string,
  idempotencyKey: string,
): Promise<BookingRow | undefined> {
  const [existing] = await db
    .select()
    .from(booking)
    .where(and(eq(booking.userId, userId), eq(booking.idempotencyKey, idempotencyKey)))
    .limit(1);

  return existing;
}

/**
 * Both boxes are required by the contract, so reaching here means both were
 * ticked and the payload itself carries nothing further. Recorded against a
 * policy version so the acceptance stays meaningful after the wording changes.
 */
async function recordConsents(db: Database, bookingId: string, consents: Consents): Promise<void> {
  void consents;

  await db
    .insert(bookingConsent)
    .values([
      { bookingId, kind: "terms" as const, policyVersion: POLICY_VERSION },
      { bookingId, kind: "cancellation_policy" as const, policyVersion: POLICY_VERSION },
    ])
    .onConflictDoNothing();
}

/**
 * The quote's priced extras, copied onto the booking. booking.get reads this
 * table, and until now nothing wrote it, so every booking reported no extras.
 */
async function copyQuoteExtras(
  db: Database,
  bookingId: string,
  lines: readonly QuoteLine[],
): Promise<void> {
  const extraLines = lines.filter((line) => line.kind === "extra" || line.kind === "fee");
  if (extraLines.length === 0) return;

  await db.insert(bookingExtra).values(
    extraLines.map((line) => ({
      bookingId,
      code: line.code,
      label: line.label,
      // Mirrors pricedItemSchema in contracts/catalog.ts, which is what the
      // listing page uses for the same items.
      pricingType:
        line.payWhen === "at_check_in" ? ("pay_at_check_in" as const) : ("per_booking" as const),
      amountMinor: line.amountMinor,
      currency: line.currency,
    })),
  );
}

/**
 * Secures the slot with the provider, moving OPTION_PENDING → OPTION_HELD. Any
 * failure lands the booking in PROVIDER_REJECTED and surfaces as a conflict, so
 * the customer is told to reprice rather than left holding nothing.
 */
async function holdOption(
  db: Database,
  provider: InventoryProvider,
  created: BookingRow,
  priced: typeof quote.$inferSelect,
  account: { name: string; email: string },
  redeem: () => Promise<void>,
): Promise<BookingRow> {
  const pending = await transition(db, created, "OPTION_PENDING");
  const crewType = asCrewType(priced.crewType);

  try {
    const draft: Parameters<InventoryProvider["createOption"]>[0] = {
      listingId: priced.listingId,
      quoteId: priced.providerQuoteId ?? priced.id,
      checkIn: priced.checkIn,
      checkOut: priced.checkOut,
      guests: priced.guests,
      extras: priced.extras,
      // The provider re-prices before holding and refuses if this no longer
      // matches what the customer agreed to.
      priceSourceHash: priced.priceSourceHash,
      customer: {
        name: account.name,
        email: account.email,
        phone: created.guestPhone ?? undefined,
        countryCode: created.guestCountryCode ?? undefined,
      },
    };

    if (crewType) draft.crewType = crewType;

    const reservation = await provider.createOption(draft);

    let held: BookingRow;
    try {
      held = await transition(db, pending, "OPTION_HELD", {
        providerOptionId: reservation.providerOptionId ?? null,
        providerReservationId: reservation.providerReservationId ?? null,
        // Written with the ids it belongs to: a token persisted separately, or
        // later, is a token that can already be stale.
        providerReservationUuid: reservation.securityToken ?? null,
        providerStatus: reservation.status,
        holdExpiresAt: reservation.holdExpiresAt ? new Date(reservation.holdExpiresAt) : null,
        crewListLink: reservation.crewListLink ?? null,
      });
    } catch (error) {
      // booking_provider_option_uq: someone else already holds this exact option.
      // Surface it as a conflict rather than leaking the failed statement.
      if (isUniqueViolation(error)) {
        await transition(db, pending, "PROVIDER_REJECTED", {
          cancelReason: "This slot was taken while you were checking out",
        });
        throw new ORPCError("CONFLICT", {
          message: "This slot was taken while you were checking out — please reprice",
        });
      }
      throw error;
    }

    await recordEvent(db, held.id, "option_created", held.provider, reservation.providerOptionId, {
      reservation,
    });

    // Only now that the slot is ours.
    await redeem();

    return held;
  } catch (error) {
    // Already handled and already moved to a terminal state — re-running the
    // transition here would fail its compare-and-set and mask the real reason.
    if (error instanceof ORPCError) throw error;

    const rejected = await transition(db, pending, "PROVIDER_REJECTED", {
      cancelReason: error instanceof Error ? error.message : "Provider rejected the option",
    });
    await recordEvent(db, rejected.id, "confirm_failed", rejected.provider, null, {
      message: rejected.cancelReason,
    });
    throw new ORPCError("CONFLICT", {
      message: rejected.cancelReason ?? "Provider rejected the option",
    });
  }
}

/**
 * Cancels a booking. Customers may cancel anything not yet confirmed; a confirmed
 * booking is admin-only and routes through the refund branch instead.
 */
export async function cancelBooking(
  db: Database,
  provider: InventoryProvider,
  id: string,
  reason: string | undefined,
  actor: { userId: string; isAdmin: boolean },
): Promise<CancelResult> {
  const row = actor.isAdmin
    ? await readAnyBooking(db, id)
    : await readOwnedBooking(db, actor.userId, id);
  const current = row.booking.status;

  if (!actor.isAdmin && !isUserCancellable(current)) {
    throw new ORPCError("CONFLICT", {
      message:
        current === "CONFIRMED"
          ? "A confirmed booking has to be cancelled by our team"
          : `A booking in ${current} cannot be cancelled`,
    });
  }

  const target: BookingStatus = current === "CONFIRMED" ? "REFUND_PENDING" : "CANCELLED";

  try {
    const moved = await transition(db, row.booking, target, {
      cancelReason: reason ?? null,
      cancelledAt: new Date(),
    });

    if (row.booking.providerOptionId) {
      await recordEvent(
        db,
        moved.id,
        "cancel_requested",
        moved.provider,
        row.booking.providerOptionId,
        {
          reason: reason ?? null,
        },
      );

      await releaseProviderOption(db, provider, row.booking);
    }

    /*
     * Only the no-money branch. A cancelled CONFIRMED booking lands at REFUND_PENDING and is
     * answered by the refund mail once the money actually moves, which is the one that can
     * state an amount.
     */
    if (moved.status === "CANCELLED" && row.booking.guestEmail) {
      await notifyBookingCancelled({
        to: row.booking.guestEmail,
        guestName: row.booking.guestFullName ?? "Guest",
        bookingId: moved.id,
        reference: row.booking.reference,
        yachtName: row.booking.commercialSnapshot.listingTitle,
        checkIn: row.quote.checkIn,
        checkOut: row.quote.checkOut,
        reason,
      });
    }

    return { id: moved.id, status: moved.status };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new ORPCError("CONFLICT", { message: error.message });
    }
    throw error;
  }
}

/**
 * Hands the slot back to the provider. Without this a cancelled booking leaves a
 * live option on a real yacht, unbookable until the provider expires it.
 *
 * Deliberately best-effort and after the local transition: the customer's
 * cancellation has already succeeded, and a provider that refuses here must not
 * undo it. The failure is recorded for the reconciliation pass instead.
 */
async function releaseProviderOption(
  db: Database,
  provider: InventoryProvider,
  row: BookingRow,
): Promise<void> {
  if (!provider.capabilities().supportsOptions || !row.providerOptionId) return;

  const reservationId = row.providerReservationId ?? row.providerOptionId;

  try {
    const released = await provider.cancelOption({
      providerReservationId: reservationId,
      securityToken: row.providerReservationUuid ?? undefined,
    });

    await db
      .update(booking)
      .set({
        providerReservationUuid: released.securityToken ?? row.providerReservationUuid,
        providerStatus: released.status,
      })
      .where(eq(booking.id, row.id));

    await recordEvent(db, row.id, "cancel_succeeded", row.provider, reservationId, {
      reservation: released,
    });
  } catch (error) {
    // `provider_reservation_event_kind` has no cancel_failed; the sweeper reports
    // the same outcome the same way, as an attempted release that did not land.
    await recordEvent(db, row.id, "option_released", row.provider, reservationId, {
      released: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Consumes the promo code and the referral credit the quote was priced with.
 *
 * Deliberately called after the provider option is secured: spending a
 * single-use code, or someone's credit balance, on a booking that then fails to
 * hold a slot would leave both gone with nothing to show for it.
 */
async function redeemFor(
  db: Database,
  bookingId: string,
  userId: string,
  priced: typeof quote.$inferSelect,
): Promise<void> {
  const discountId = priced.discountId;

  if (discountId) {
    const discountedMinor = priced.lines
      .filter((line) => line.kind === "discount")
      .reduce((total, line) => total + Math.abs(line.amountMinor), 0);

    await db.transaction(async (tx) => {
      await redeemDiscount(tx, {
        discountId,
        userId,
        bookingId,
        amountMinor: discountedMinor,
        currency: priced.currency,
      });
    });
  }

  // Re-checks the balance under the transaction: the quote may be minutes old and
  // the credit could have been spent elsewhere since.
  if (priced.creditAppliedMinor > 0) {
    await db.transaction(async (tx) => {
      await redeemCredit(tx, {
        userId,
        bookingId,
        amountMinor: priced.creditAppliedMinor,
        currency: priced.currency,
      });
    });
  }
}

/* ------------------------------------------------------------------ internals */

/** The only writer of booking.status — every change goes through the §6 table. */
async function transition(
  db: DatabaseExecutor,
  row: BookingRow,
  to: BookingStatus,
  patch: Partial<typeof booking.$inferInsert> = {},
): Promise<BookingRow> {
  try {
    assertTransition(row.status, to);
  } catch (error) {
    // Reachable when a webhook or a concurrent call already advanced the booking,
    // so this is a conflict for the caller rather than a server fault.
    if (error instanceof InvalidTransitionError) {
      throw new ORPCError("CONFLICT", { message: error.message });
    }
    throw error;
  }

  const [updated] = await db
    .update(booking)
    .set({ ...patch, status: to })
    .where(and(eq(booking.id, row.id), eq(booking.status, row.status)))
    .returning();

  // The status guard in the WHERE makes this a compare-and-set: a concurrent
  // webhook that moved the booking first wins, and this caller is told so.
  if (!updated) {
    throw new ORPCError("CONFLICT", { message: "Booking changed while it was being updated" });
  }

  return updated;
}

async function insertBooking(
  db: Database,
  values: Omit<typeof booking.$inferInsert, "reference">,
): Promise<BookingRow> {
  const row = await withUniqueRetry(5, async () => {
    const [inserted] = await db
      .insert(booking)
      .values({ ...values, reference: `NB-${randomCode(REFERENCE_LENGTH)}` })
      .returning();
    return inserted;
  });

  if (!row) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not allocate a booking" });
  }
  return row;
}

/** The jsonb body of a provider_reservation_event; `kind` says which arm applies. */
type ProviderEventPayload =
  | { reservation: ProviderReservation }
  | { message: string | null }
  | { reason: string | null }
  | { released: boolean; error: string };

async function recordEvent(
  db: DatabaseExecutor,
  bookingId: string,
  kind: typeof providerReservationEvent.$inferInsert.kind,
  provider: string,
  providerReference: string | null | undefined,
  payload: ProviderEventPayload,
): Promise<void> {
  await db.insert(providerReservationEvent).values({
    bookingId,
    kind,
    provider,
    providerReference: providerReference ?? null,
    payload: payload ?? null,
  });
}

/**
 * Freezes what the customer is looking at. Base check-in/check-out times come from
 * the base itself, since the card renders a datetime, not just a date.
 */
async function buildSnapshot(db: Database, listingId: string): Promise<CommercialSnapshot> {
  const [doc] = await db
    .select({
      title: listingSearchDoc.title,
      baseName: listingSearchDoc.baseName,
      baseId: listingSearchDoc.baseId,
      location: listingSearchDoc.location,
      country: listingSearchDoc.country,
      mainImage: listingSearchDoc.mainImage,
      gallery: listingSearchDoc.gallery,
      category: listingSearchDoc.category,
      crewType: listingSearchDoc.crewType,
      rating: listingSearchDoc.rating,
      reviewCount: listingSearchDoc.reviewCount,
      lat: listingSearchDoc.lat,
      lng: listingSearchDoc.lng,
      baseEmail: listingSearchDoc.baseEmail,
      basePhone: listingSearchDoc.basePhone,
      baseWebsite: listingSearchDoc.baseWebsite,
      depositInsuranceIncluded: listingSearchDoc.depositInsuranceIncluded,
      petsAllowed: listingSearchDoc.petsAllowed,
      lengthM: listingSearchDoc.lengthM,
      cabins: listingSearchDoc.cabins,
      berths: listingSearchDoc.berths,
      heads: listingSearchDoc.heads,
      yearBuilt: listingSearchDoc.yearBuilt,
      sailType: listingSearchDoc.sailType,
      amenities: listingSearchDoc.amenities,
    })
    .from(listingSearchDoc)
    .where(eq(listingSearchDoc.listingId, listingId))
    .limit(1);

  if (!doc) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });

  const [baseRow] = await db
    .select({ checkInTime: base.checkInTime, checkOutTime: base.checkOutTime })
    .from(base)
    .where(eq(base.id, doc.baseId))
    .limit(1);

  return {
    listingTitle: doc.title,
    baseName: doc.baseName,
    locationName: doc.location,
    countryName: doc.country,
    mainImage: doc.mainImage,
    gallery: doc.gallery,
    category: doc.category,
    crewType: doc.crewType,
    rating: Number(doc.rating),
    reviewCount: doc.reviewCount,
    checkInTime: baseRow?.checkInTime ?? null,
    checkOutTime: baseRow?.checkOutTime ?? null,
    baseLat: doc.lat,
    baseLng: doc.lng,
    baseEmail: doc.baseEmail,
    basePhone: doc.basePhone,
    baseWebsite: doc.baseWebsite,
    depositInsuranceIncluded: doc.depositInsuranceIncluded,
    petsAllowed: doc.petsAllowed,
    specs: {
      lengthM: Number(doc.lengthM ?? 0),
      cabins: doc.cabins ?? 0,
      berths: doc.berths ?? 0,
      heads: doc.heads ?? 0,
      yearBuilt: doc.yearBuilt ?? 0,
      sailType: doc.sailType,
    },
    amenities: doc.amenities,
  };
}

type MoneyTotals = { paidMinor: number; nextDueAt: Date | null };

/** Paid-to-date and the next instalment, for every booking in one round trip. */
async function loadMoney(db: Database, bookingIds: string[]): Promise<Map<string, MoneyTotals>> {
  const totals = new Map<string, MoneyTotals>();
  if (bookingIds.length === 0) return totals;

  const [paid, due] = await Promise.all([
    db
      .select({ bookingId: payment.bookingId, amountMinor: payment.amountMinor })
      .from(payment)
      .where(and(inArray(payment.bookingId, bookingIds), eq(payment.status, "succeeded"))),
    db
      .select({ bookingId: paymentSchedule.bookingId, dueAt: paymentSchedule.dueAt })
      .from(paymentSchedule)
      .where(
        and(inArray(paymentSchedule.bookingId, bookingIds), eq(paymentSchedule.status, "pending")),
      ),
  ]);

  for (const row of paid) {
    const current = totals.get(row.bookingId) ?? { paidMinor: 0, nextDueAt: null };
    current.paidMinor += row.amountMinor;
    totals.set(row.bookingId, current);
  }

  for (const row of due) {
    const current = totals.get(row.bookingId) ?? { paidMinor: 0, nextDueAt: null };
    if (row.dueAt && (!current.nextDueAt || row.dueAt < current.nextDueAt)) {
      current.nextDueAt = row.dueAt;
    }
    totals.set(row.bookingId, current);
  }

  return totals;
}

function presentSummary(
  row: BookingRow,
  priced: typeof quote.$inferSelect,
  money: MoneyTotals | undefined,
): Summary {
  const snapshot = row.commercialSnapshot;
  const paidMinor = money?.paidMinor ?? 0;
  const specs = snapshot.specs ?? {
    lengthM: 0,
    cabins: 0,
    berths: 0,
    heads: 0,
    yearBuilt: 0,
    sailType: null,
  };

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    listing: {
      id: row.listingId,
      title: snapshot.listingTitle,
      mainImage: snapshot.mainImage,
      gallery: snapshot.gallery,
      rating: snapshot.rating,
      reviewCount: snapshot.reviewCount,
      category: snapshot.category,
      crewType: snapshot.crewType,
      specs,
      amenities: snapshot.amenities ?? [],
      badges: badgesFor({
        petsAllowed: snapshot.petsAllowed ?? false,
        depositInsuranceIncluded: snapshot.depositInsuranceIncluded ?? false,
        rating: snapshot.rating,
      }),
    },
    base: {
      name: snapshot.baseName,
      locationName: snapshot.locationName,
      countryName: snapshot.countryName,
      address: `${snapshot.baseName}, ${snapshot.locationName}, ${snapshot.countryName}`,
      coordinates: { lat: snapshot.baseLat ?? 0, lng: snapshot.baseLng ?? 0 },
      timeZone: BASE_TIME_ZONE,
      phone: snapshot.basePhone ?? null,
      website: snapshot.baseWebsite ?? null,
      email: snapshot.baseEmail ?? null,
    },
    checkIn: combine(priced.checkIn, snapshot.checkInTime),
    checkOut: combine(priced.checkOut, snapshot.checkOutTime),
    guests: priced.guests,
    total: { amountMinor: row.totalMinor, currency: row.currency },
    perPerson: {
      amountMinor: priced.guests ? Math.round(row.totalMinor / priced.guests) : row.totalMinor,
      currency: row.currency,
    },
    paidTotal: { amountMinor: paidMinor, currency: row.currency },
    balanceDue: { amountMinor: Math.max(row.totalMinor - paidMinor, 0), currency: row.currency },
    outstanding: { amountMinor: outstandingMinor(priced, paidMinor), currency: row.currency },
    payableNow: {
      amountMinor: payableNowFor(priced, paidMinor, row),
      currency: row.currency,
    },
    dueAtCheckIn: { amountMinor: atCheckInMinor(priced), currency: row.currency },
    prepayment: { amountMinor: priced.depositMinor, currency: row.currency },
    nextPaymentDueAt: money?.nextDueAt?.toISOString() ?? null,
    cancellable: isUserCancellable(row.status),
    createdAt: row.createdAt.toISOString(),
  };
}

function presentHold(row: BookingRow, accessToken: string | null): Hold {
  return {
    bookingId: row.id,
    reference: row.reference,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    optionHeld: row.status === "OPTION_HELD",
    accessToken,
  };
}

/**
 * `combine` below stamps every charter date as UTC without converting it, so
 * this is the only zone that agrees with checkIn/checkOut today. Bases carry no
 * real IANA zone yet — swap this out once they do.
 */
const BASE_TIME_ZONE = "UTC";

/**
 * The card shows a date and a time, so the base's local check-in/out time is
 * attached to the charter date. Falls back to midnight when a base has no time set.
 */
function combine(date: string, time: string | null): string {
  const clock = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "00:00";
  return `${date}T${clock}:00.000Z`;
}
