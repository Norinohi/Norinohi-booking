import "../test-support/checkout-env";

import { booking } from "@yacht-charter/db/schema/booking";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { liveBookingHolding } from "@yacht-charter/providers/booking-manager/booking";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";

/*
 * Before Booking Manager's adapter takes over or deletes an option of ours it finds on a slot,
 * it asks whether one of our live bookings holds it. The vendor knows a reservation by two ids,
 * so either one, on any of the three columns that keep them, counts; a booking that has let its
 * hold go does not.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  /* The search world already carries a Booking Manager provider row to point a booking at. */
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function bookingManagerHold(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);
  await db
    .update(booking)
    .set({
      provider: "booking_manager",
      providerReservationId: "8295147330000100225",
      providerOptionId: "8295147330000100225",
      providerAgencyReservationId: "8295147120000107113",
    })
    .where(eq(booking.id, hold.bookingId));
  return hold.bookingId;
}

describe("liveBookingHolding", () => {
  it("names the live booking holding either of the reservation's ids", async () => {
    const { db } = test;
    const bookingId = await bookingManagerHold("holder");

    await expect(liveBookingHolding(db, ["8295147330000100225"])).resolves.toBe(bookingId);
    await expect(liveBookingHolding(db, ["8295147120000107113"])).resolves.toBe(bookingId);
    await expect(liveBookingHolding(db, ["8295148140000100225"])).resolves.toBeUndefined();

    await db.update(booking).set({ status: "OPTION_EXPIRED" }).where(eq(booking.id, bookingId));
    await expect(liveBookingHolding(db, ["8295147330000100225"])).resolves.toBeUndefined();
  });
});
