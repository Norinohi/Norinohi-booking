import "../test-support/checkout-env";

import { booking } from "@yacht-charter/db/schema/index";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";
import { repriceQuote } from "./quote";

/*
 * A checkout reloaded after Confirm reprices the quote its URL names. That quote is the booking's
 * own, so the vendor must not be asked about it again while the hold runs: its answer is our own
 * option, read back as the week being taken.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

async function heldBooking(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const priced = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, priced.quoteId);
  return { userId, priced, hold };
}

describe("reprice of a quote a booking holds", () => {
  it("answers with the stored quote without asking the vendor", async () => {
    const { userId, priced } = await heldBooking("held-reload");
    const quoteSpy = vi.spyOn(inventory, "getQuote");

    const reloaded = await repriceQuote(test.db, inventory, priced.quoteId, userId);

    expect(quoteSpy).not.toHaveBeenCalled();
    expect(reloaded).toMatchObject({
      quoteId: priced.quoteId,
      repriced: false,
      checkIn: priced.checkIn,
      checkOut: priced.checkOut,
      total: priced.total,
      deposit: priced.deposit,
      paymentPolicy: priced.paymentPolicy,
      paymentSchedule: priced.paymentSchedule,
      lines: priced.lines,
    });
    quoteSpy.mockRestore();
  });

  it("asks the vendor again once the hold has lapsed", async () => {
    const { userId, priced, hold } = await heldBooking("held-lapsed");
    await test.db
      .update(booking)
      .set({ holdExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(booking.id, hold.bookingId));
    const quoteSpy = vi.spyOn(inventory, "getQuote");

    await repriceQuote(test.db, inventory, priced.quoteId, userId).catch(() => null);

    expect(quoteSpy).toHaveBeenCalled();
    quoteSpy.mockRestore();
  });

  it("asks the vendor when the caller changes the charter", async () => {
    const { userId, priced } = await heldBooking("held-change");
    const quoteSpy = vi.spyOn(inventory, "getQuote");

    await repriceQuote(test.db, inventory, priced.quoteId, userId, { guests: 2 }).catch(() => null);

    expect(quoteSpy).toHaveBeenCalled();
    quoteSpy.mockRestore();
  });
});
