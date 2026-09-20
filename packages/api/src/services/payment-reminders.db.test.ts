import "../test-support/checkout-env";

import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { booking, paymentSchedule } from "@yacht-charter/db/schema/booking";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";

import { sendBalanceReminders } from "./payment-reminders";

/*
 * The chasing letters, run with the clock moved forward rather than by waiting.
 *
 *   balance   one letter ten days out, a second three days out, a notice once the date passes
 *   hold      an unpaid hold about to be released earns one warning while it still stands
 *
 * Mail is unconfigured in this suite (see checkout-env), so nothing leaves the process and the
 * assertions are on what the run claimed: that is the property worth pinning, because the claim
 * is what stops a customer being mailed the same letter every day.
 *
 * Each case books its own yacht and asserts only on its own booking, because every run walks the
 * whole table.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function holdOn(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);

  await db
    .update(booking)
    .set({ guestEmail: `${slug}@example.test`, guestFullName: "Test Guest" })
    .where(eq(booking.id, hold.bookingId));

  return { bookingId: hold.bookingId, listingId, userId };
}

/**
 * A confirmed charter with a balance falling due on `dueAt`.
 *
 * Written straight in rather than driven through checkout and the Stripe webhook: what is under
 * test is which rows a run selects and claims, and a real deposit payment would add nothing to
 * that while tying these cases to the payment suite's fixtures.
 */
async function confirmedWithBalance(slug: string, dueAt: Date) {
  const { db } = test;
  const { bookingId } = await holdOn(slug);

  await db.update(booking).set({ status: "CONFIRMED" }).where(eq(booking.id, bookingId));
  const [row] = await db
    .insert(paymentSchedule)
    .values({
      bookingId,
      kind: "balance",
      amountMinor: 175_000,
      currency: "EUR",
      dueAt,
      status: "pending",
    })
    .returning();

  if (!row) throw new Error("no schedule row");
  return { bookingId, scheduleId: row.id };
}

async function scheduleRow(scheduleId: string) {
  const [row] = await test.db
    .select()
    .from(paymentSchedule)
    .where(eq(paymentSchedule.id, scheduleId));
  if (!row) throw new Error(`no schedule ${scheduleId}`);
  return row;
}

describe("balance reminders", () => {
  it("sends each of the three letters once, as the due date approaches and passes", async () => {
    const { db } = test;
    const dueAt = new Date(Date.now() + 40 * DAY);
    const { scheduleId } = await confirmedWithBalance("balance-letters", dueAt);
    const at = (daysBeforeDue: number) => new Date(dueAt.getTime() - daysBeforeDue * DAY);

    // Outside every window: the balance is a month and a half away.
    await sendBalanceReminders(db, at(20));
    expect(await scheduleRow(scheduleId)).toMatchObject({
      reminderSentAt: null,
      finalReminderSentAt: null,
      overdueNoticeSentAt: null,
    });

    await sendBalanceReminders(db, at(8));
    const reminded = await scheduleRow(scheduleId);
    expect(reminded.reminderSentAt).not.toBeNull();
    expect(reminded.finalReminderSentAt).toBeNull();

    // A second run the next day must not repeat the letter it already sent.
    await sendBalanceReminders(db, at(7));
    expect((await scheduleRow(scheduleId)).reminderSentAt).toEqual(reminded.reminderSentAt);

    await sendBalanceReminders(db, at(2));
    const chased = await scheduleRow(scheduleId);
    expect(chased.finalReminderSentAt).not.toBeNull();
    expect(chased.overdueNoticeSentAt).toBeNull();

    const overdue = await sendBalanceReminders(db, at(-1));
    expect(overdue.overdueSent).toBeGreaterThanOrEqual(1);
    expect((await scheduleRow(scheduleId)).overdueNoticeSentAt).not.toBeNull();

    const again = await sendBalanceReminders(db, at(-2));
    expect(again.sent).toBe(0);
  });

  it("leaves a settled installment alone once it is paid", async () => {
    const { db } = test;
    const dueAt = new Date(Date.now() + 40 * DAY);
    const { scheduleId } = await confirmedWithBalance("balance-settled", dueAt);

    await db
      .update(paymentSchedule)
      .set({ status: "paid" })
      .where(eq(paymentSchedule.id, scheduleId));

    await sendBalanceReminders(db, new Date(dueAt.getTime() - 8 * DAY));
    await sendBalanceReminders(db, new Date(dueAt.getTime() + DAY));

    expect(await scheduleRow(scheduleId)).toMatchObject({
      reminderSentAt: null,
      overdueNoticeSentAt: null,
    });
  });

  it("says nothing about an installment months past its date", async () => {
    const { db } = test;
    const dueAt = new Date(Date.now() - 90 * DAY);
    const { scheduleId } = await confirmedWithBalance("balance-ancient", dueAt);

    await sendBalanceReminders(db, new Date());

    expect((await scheduleRow(scheduleId)).overdueNoticeSentAt).toBeNull();
  });
});

describe("expiring holds", () => {
  it("warns once while the hold still stands, and not before", async () => {
    const { db } = test;
    const { bookingId } = await holdOn("hold-warning");
    const expiresAt = (await bookingState(db, bookingId)).booking.holdExpiresAt;
    if (!expiresAt) throw new Error("the mock provider granted no expiry");

    // The mock holds for 48 hours and the warning window is 36, so a run at the moment of
    // the hold is too early to say anything.
    const early = await sendBalanceReminders(db, new Date(expiresAt.getTime() - 40 * HOUR));
    expect(early.holdSent).toBe(0);
    expect((await bookingState(db, bookingId)).booking.holdReminderSentAt).toBeNull();

    const warned = await sendBalanceReminders(db, new Date(expiresAt.getTime() - 12 * HOUR));
    expect(warned.holdSent).toBeGreaterThanOrEqual(1);
    const claimedAt = (await bookingState(db, bookingId)).booking.holdReminderSentAt;
    expect(claimedAt).not.toBeNull();

    // Once more inside the window, and once past the hold: neither may mail again.
    await sendBalanceReminders(db, new Date(expiresAt.getTime() - 6 * HOUR));
    await sendBalanceReminders(db, new Date(expiresAt.getTime() + HOUR));
    expect((await bookingState(db, bookingId)).booking.holdReminderSentAt).toEqual(claimedAt);
  });
});
