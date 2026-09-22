import {
  availabilitySlot,
  booking,
  listing,
  listingFreePeriod,
  listingOffer,
  listingPricePeriod,
  listingSource,
  outboxMessage,
  payment,
  paymentSchedule,
  provider,
  providerRecord,
  providerReservationEvent,
  providerWebhookEvent,
  quote,
  user,
} from "@yacht-charter/db/schema/index";
import { listAvailabilityCalendar } from "@yacht-charter/db/search/availability-constraints";
import { rebuildListingSearchDocs } from "@yacht-charter/db/search/read-model";
import type { TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { asc, eq } from "drizzle-orm";
import { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { databaseInventorySource } from "@yacht-charter/providers/mock/inventory";

import { createHold } from "../services/booking";
import { createQuote } from "../services/quote";

/*
 * The smallest catalogue a customer can book from end to end: one operator and base, a `mock`
 * provider row, and per scenario a published yacht whose only offer that provider sells.
 *
 * The provider is the real `MockInventoryProvider` reading the suite's own `availability_slot`
 * rows, which is how `PROVIDER_MODE=mock` runs. Its code matches the offer's, so every routing
 * lookup (`providerByKey`) answers with this instance rather than building one from the
 * process-wide pool. Its reservation references are parsed back into a yacht id, which is why
 * listings here are `ylst_<slug>` with no underscore in the slug.
 */

export type Db = TestDatabase["db"];

/* Past the 60-day deposit lead time on every weekday: a Saturday exactly 60 days out is already
   payable in full, which failed the deposit path each Tuesday. */
export const WEEK_START = isoDay(saturdayAhead(61));
export const WEEK_END = shiftIso(WEEK_START, 7);
export const WEEKLY_RATE_MINOR = 350_000;

export async function seedBookingWorld(db: Db): Promise<MockInventoryProvider> {
  await seedSearchWorld(db);
  await db.insert(provider).values({ id: "prov_mock", code: "mock", name: "Mock" });
  return new MockInventoryProvider({ inventory: databaseInventorySource(db) });
}

/**
 * One bookable week on a fresh yacht. `operatorConfirms` sets the NauSYS flag that makes the
 * operator approve every option by hand, which checkout has to refuse.
 */
export async function seedYacht(
  db: Db,
  slug: string,
  options: { operatorConfirms?: boolean } = {},
): Promise<{ listingId: string; offerId: string }> {
  const listingId = `ylst_${slug}`;
  const offerId = `off_${slug}`;

  await db.insert(listing).values({
    id: listingId,
    slug,
    title: `Yacht ${slug}`,
    operatorId: "op_test",
    homeBaseId: "base_test",
    status: "published",
  });
  await db.insert(providerRecord).values({
    id: `prec_${slug}`,
    providerId: "prov_mock",
    resourceType: "yacht",
    externalId: slug,
  });
  await db.insert(listingSource).values({
    id: `lsrc_${slug}`,
    listingId,
    providerRecordId: `prec_${slug}`,
    externalYachtId: slug,
  });
  await db.insert(listingOffer).values({
    id: offerId,
    listingId,
    listingSourceId: `lsrc_${slug}`,
    providerId: "prov_mock",
    operatorId: "op_test",
    homeBaseId: "base_test",
    crewType: "bareboat",
    defaultCurrency: "EUR",
    optionApprovalRequired: options.operatorConfirms ? true : null,
  });
  await db.insert(listingPricePeriod).values({
    listingId,
    listingOfferId: offerId,
    startDate: WEEK_START,
    endDate: WEEK_END,
    kind: "weekly",
    priceMinor: WEEKLY_RATE_MINOR,
    currency: "EUR",
  });
  await db.insert(listingFreePeriod).values({
    listingId,
    listingOfferId: offerId,
    startDate: WEEK_START,
    endDate: WEEK_END,
  });
  await db.insert(availabilitySlot).values({
    listingId,
    listingOfferId: offerId,
    startDate: WEEK_START,
    endDate: WEEK_END,
    status: "available",
    priceMinor: WEEKLY_RATE_MINOR,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });

  await rebuildListingSearchDocs(db, { listingIds: [listingId] });
  return { listingId, offerId };
}

export async function seedCustomer(db: Db, id: string): Promise<string> {
  await db.insert(user).values({ id, name: `Customer ${id}`, email: `${id}@example.test` });
  return id;
}

export function quoteWeek(
  db: Db,
  inventory: MockInventoryProvider,
  listingId: string,
  userId: string,
) {
  return createQuote(
    db,
    inventory,
    {
      listingId,
      checkIn: WEEK_START,
      checkOut: WEEK_END,
      guests: 4,
      extras: [],
      currency: "EUR",
    },
    userId,
  );
}

export function holdQuote(
  db: Db,
  inventory: MockInventoryProvider,
  userId: string,
  quoteId: string,
  idempotencyKey = `key-${quoteId}`,
) {
  return createHold(
    db,
    inventory,
    { userId, guestAccess: null },
    quoteId,
    idempotencyKey,
    {
      fullName: `Customer ${userId}`,
      email: `${userId}@example.test`,
      phone: "+385 1 234 5678",
      countryCode: "HR",
    },
    { terms: true, cancellationPolicy: true },
  );
}

/**
 * Whether the week is still offered to the next visitor. The sync never hears about our own
 * holds, so this is the read-time subtraction a live booking has to trigger and a released one
 * has to undo.
 */
export async function weekOnSale(db: Db, listingId: string): Promise<boolean> {
  const calendar = await listAvailabilityCalendar(db, {
    listingId,
    from: WEEK_START,
    to: WEEK_END,
  });
  return calendar.slots.some(
    (slot) => slot.status === "available" && slot.startDate === WEEK_START,
  );
}

/** Everything the chain writes about one booking, read back in a stable order. */
export async function bookingState(db: Db, bookingId: string) {
  const [row] = await db.select().from(booking).where(eq(booking.id, bookingId));
  if (!row) throw new Error(`no booking ${bookingId}`);

  const [priced] = await db.select().from(quote).where(eq(quote.id, row.quoteId));
  const payments = await db
    .select()
    .from(payment)
    .where(eq(payment.bookingId, bookingId))
    .orderBy(asc(payment.createdAt));
  const schedules = await db
    .select()
    .from(paymentSchedule)
    .where(eq(paymentSchedule.bookingId, bookingId))
    .orderBy(asc(paymentSchedule.createdAt));
  const events = await db
    .select()
    .from(providerReservationEvent)
    .where(eq(providerReservationEvent.bookingId, bookingId))
    .orderBy(asc(providerReservationEvent.createdAt));
  const outbox = await db
    .select()
    .from(outboxMessage)
    .where(eq(outboxMessage.subjectId, bookingId));

  return { booking: row, quote: priced, payments, schedules, events, outbox };
}

export async function webhookRow(db: Db, eventId: string) {
  const rows = await db
    .select()
    .from(providerWebhookEvent)
    .where(eq(providerWebhookEvent.externalEventId, eventId));
  return rows;
}
