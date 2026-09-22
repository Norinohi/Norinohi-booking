import "../test-support/checkout-env";

import { quote } from "@yacht-charter/db/schema/quote";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
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
import { getBooking } from "./booking";

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

/* The marina on the booking page names where the charter starts; a one-way ends elsewhere. */
describe("the booking page's route", () => {
  it("names both marinas of a one-way the quote was priced on, and nothing for a round trip", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "one-way");
    const userId = await seedCustomer(db, "usr_one_way");
    const priced = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, priced.quoteId);

    expect((await getBooking(db, userId, hold.bookingId)).oneWayRoute).toBeNull();

    const { quote: row } = await bookingState(db, hold.bookingId);
    if (!row) throw new Error("no quote");
    await db
      .update(quote)
      .set({
        route: { startBaseId: "31404981", endBaseId: "2206479" },
        routeOptions: [
          {
            startBaseId: "31404981",
            endBaseId: "2206479",
            startBaseName: "Fethiye, Yacht Club Mai",
            endBaseName: "Marmaris, Albatros Marina",
            isOneWay: true,
            total: { amountMinor: row.totalMinor, currency: row.currency },
          },
        ],
      })
      .where(eq(quote.id, row.id));

    expect((await getBooking(db, userId, hold.bookingId)).oneWayRoute).toEqual({
      from: "Fethiye, Yacht Club Mai",
      to: "Marmaris, Albatros Marina",
    });
  });
});
