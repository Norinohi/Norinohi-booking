import { randomInt } from "node:crypto";

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
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
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
import { redeemDiscount } from "./discount";
import { paginationFor } from "./pagination";
import { assertQuoteIsFresh } from "./quote";

type Db = Database;
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

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERENCE_LENGTH = 8;
const UNIQUE_VIOLATION = "23505";

/* --------------------------------------------------------------------- reads */

export async function listBookings(db: Db, userId: string, input: ListInput): Promise<ListResult> {
  const filters = [eq(booking.userId, userId)];
  if (input.status?.length) filters.push(inArray(booking.status, input.status));

  // The date filter is on the charter period, which lives on the quote — that is
  // what "Any dates" means on a history screen, not when the booking was made.
  const dateFilters = [];
  if (input.from) dateFilters.push(gte(quote.checkOut, input.from));
  if (input.to) dateFilters.push(lte(quote.checkIn, input.to));

  const where = and(...filters, ...dateFilters);

  const [rows, [totals]] = await Promise.all([
    db
      .select({ booking, quote })
      .from(booking)
      .innerJoin(quote, eq(quote.id, booking.quoteId))
      .where(where)
      .orderBy(desc(booking.createdAt), desc(booking.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db
      .select({ totalItems: count() })
      .from(booking)
      .innerJoin(quote, eq(quote.id, booking.quoteId))
      .where(where),
  ]);

  const ids = rows.map((row) => row.booking.id);
  const money = await loadMoney(db, ids);

  const items = rows.map((row) =>
    presentSummary(row.booking, row.quote, money.get(row.booking.id)),
  );

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems: totals?.totalItems ?? 0,
      itemCount: items.length,
    }),
  };
}

export async function getBooking(db: Db, userId: string, id: string): Promise<Detail> {
  const row = await readOwned(db, userId, id);

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
    holdExpiresAt: row.booking.holdExpiresAt?.toISOString() ?? null,
    confirmedAt: row.booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.booking.cancelledAt?.toISOString() ?? null,
    cancelReason: row.booking.cancelReason,
    priceLines: row.quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
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
    })),
  };
}

export async function getCheckoutStatus(db: Db, userId: string, id: string): Promise<Status> {
  const row = await readOwned(db, userId, id);

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
 * Turns a fresh quote into a booking, holding a provider option when the provider
 * supports one. Idempotent on `idempotencyKey`: a retried submit returns the
 * booking the first call created rather than holding a second option (§6.2).
 */
export async function createHold(
  db: Db,
  provider: InventoryProvider,
  userId: string,
  quoteId: string,
  idempotencyKey: string,
  guest: GuestDetails,
  consents: Consents,
): Promise<Hold> {
  const existing = await db
    .select()
    .from(booking)
    .where(eq(booking.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing[0]) {
    if (existing[0].userId !== userId) throw new ORPCError("FORBIDDEN");
    return presentHold(existing[0]);
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
    specialRequests: guest.specialRequests ?? null,
    userId,
    listingId: priced.listingId,
    provider: priced.provider,
    totalMinor: priced.totalMinor,
    currency: priced.currency,
    commercialSnapshot: snapshot,
    idempotencyKey,
  });

  // The quote is now spoken for; a second booking must not be built from it.
  await db.update(quote).set({ userId, status: "consumed" }).where(eq(quote.id, priced.id));

  // Both boxes are required by the contract, so reaching here means both were
  // ticked. Recorded against a policy version so the acceptance stays meaningful
  // after the wording changes.
  void consents;
  await db
    .insert(bookingConsent)
    .values([
      { bookingId: created.id, kind: "terms" as const, policyVersion: POLICY_VERSION },
      {
        bookingId: created.id,
        kind: "cancellation_policy" as const,
        policyVersion: POLICY_VERSION,
      },
    ])
    .onConflictDoNothing();

  // The quote's priced extras, copied onto the booking. booking.get reads this
  // table, and until now nothing wrote it, so every booking reported no extras.
  const extraLines = priced.lines.filter((line) => line.kind === "extra" || line.kind === "fee");

  if (extraLines.length > 0) {
    await db.insert(bookingExtra).values(
      extraLines.map((line) => ({
        bookingId: created.id,
        code: line.code,
        label: line.label,
        // Mirrors pricedItemSchema in contracts/catalog.ts, which is what the
        // listing page uses for the same items.
        pricingType: line.payWhen === "at_check_in" ? "pay_at_check_in" : "per_booking",
        amountMinor: line.amountMinor,
        currency: line.currency,
      })),
    );
  }

  // Quoting is public and must never consume a code, so the usage limit only
  // becomes binding here. Re-checked under the transaction so two simultaneous
  // checkouts cannot both take the last remaining use.
  if (priced.discountId) {
    const discountedMinor = priced.lines
      .filter((line) => line.kind === "discount")
      .reduce((total, line) => total + Math.abs(line.amountMinor), 0);

    await db.transaction(async (tx) => {
      await redeemDiscount(tx, {
        discountId: priced.discountId as string,
        userId,
        bookingId: created.id,
        amountMinor: discountedMinor,
        currency: priced.currency,
      });
    });
  }

  // No option support: the booking waits at QUOTED and payment is what commits it.
  if (!provider.capabilities().supportsOptions) return presentHold(created);

  const pending = await transition(db, created, "OPTION_PENDING");

  try {
    const reservation = await provider.createOption({
      listingId: priced.listingId,
      quoteId: priced.providerQuoteId ?? priced.id,
      customer: { name: account.name, email: account.email },
    });

    let held: BookingRow;
    try {
      held = await transition(db, pending, "OPTION_HELD", {
        providerOptionId: reservation.providerOptionId ?? null,
        providerReservationId: reservation.providerReservationId ?? null,
        providerStatus: reservation.status,
        holdExpiresAt: reservation.holdExpiresAt ? new Date(reservation.holdExpiresAt) : null,
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

    return presentHold(held);
  } catch (error) {
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
  db: Db,
  id: string,
  reason: string | undefined,
  actor: { userId: string; isAdmin: boolean },
): Promise<CancelResult> {
  const row = actor.isAdmin ? await readAny(db, id) : await readOwned(db, actor.userId, id);
  const current = row.booking.status as BookingStatus;

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
    }

    return { id: moved.id, status: moved.status };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      throw new ORPCError("CONFLICT", { message: error.message });
    }
    throw error;
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
    assertTransition(row.status as BookingStatus, to);
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
  db: Db,
  values: Omit<typeof booking.$inferInsert, "reference">,
): Promise<BookingRow> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [row] = await db
        .insert(booking)
        .values({ ...values, reference: randomReference() })
        .returning();
      if (row) return row;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not allocate a booking" });
}

async function recordEvent(
  db: DatabaseExecutor,
  bookingId: string,
  kind: typeof providerReservationEvent.$inferInsert.kind,
  provider: string,
  providerReference: string | null | undefined,
  payload: unknown,
): Promise<void> {
  await db.insert(providerReservationEvent).values({
    bookingId,
    kind,
    provider,
    providerReference: providerReference ?? null,
    payload: payload ?? null,
  });
}

async function readOwned(db: Db, userId: string, id: string) {
  const [row] = await db
    .select({ booking, quote })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(and(eq(booking.id, id), eq(booking.userId, userId)))
    .limit(1);

  // Deliberately NOT_FOUND rather than FORBIDDEN: another user's booking id should
  // not be confirmable by probing.
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });
  return row;
}

async function readAny(db: Db, id: string) {
  const [row] = await db
    .select({ booking, quote })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(eq(booking.id, id))
    .limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });
  return row;
}

/**
 * Freezes what the customer is looking at. Base check-in/check-out times come from
 * the base itself, since the card renders a datetime, not just a date.
 */
async function buildSnapshot(db: Db, listingId: string): Promise<CommercialSnapshot> {
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
  };
}

type MoneyTotals = { paidMinor: number; nextDueAt: Date | null };

/** Paid-to-date and the next instalment, for every booking in one round trip. */
async function loadMoney(db: Db, bookingIds: string[]): Promise<Map<string, MoneyTotals>> {
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
    },
    base: {
      name: snapshot.baseName,
      locationName: snapshot.locationName,
      countryName: snapshot.countryName,
    },
    checkIn: combine(priced.checkIn, snapshot.checkInTime),
    checkOut: combine(priced.checkOut, snapshot.checkOutTime),
    guests: priced.guests,
    total: { amountMinor: row.totalMinor, currency: row.currency },
    paidTotal: { amountMinor: paidMinor, currency: row.currency },
    balanceDue: { amountMinor: Math.max(row.totalMinor - paidMinor, 0), currency: row.currency },
    nextPaymentDueAt: money?.nextDueAt?.toISOString() ?? null,
    cancellable: isUserCancellable(row.status as BookingStatus),
    createdAt: row.createdAt.toISOString(),
  };
}

function presentHold(row: BookingRow): Hold {
  return {
    bookingId: row.id,
    reference: row.reference,
    status: row.status,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    optionHeld: row.status === "OPTION_HELD",
  };
}

/**
 * The card shows a date and a time, so the base's local check-in/out time is
 * attached to the charter date. Falls back to midnight when a base has no time set.
 */
function combine(date: string, time: string | null): string {
  const clock = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "00:00";
  return `${date}T${clock}:00.000Z`;
}

function randomReference(): string {
  let suffix = "";
  for (let index = 0; index < REFERENCE_LENGTH; index += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `NB-${suffix}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}
