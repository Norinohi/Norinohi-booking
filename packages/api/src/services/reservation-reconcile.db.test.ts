import "../test-support/checkout-env";

import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { providerReservationEvent } from "@yacht-charter/db/schema/booking";
import type { InventoryProvider, ProviderReservationState } from "@yacht-charter/providers";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";
import { reconcileReservations } from "./reservation-reconcile";

/*
 * The operator's record against ours, for a booking the mock provider holds. The feed is
 * stubbed: what is pinned is what the pass asks for and what it reports.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

/** A held booking whose reservation the adapter recorded at yacht 111, 3,500.00 EUR. */
async function heldBooking(
  slug: string,
  payload: (typeof providerReservationEvent.$inferInsert)["payload"] = {
    yachtId: 111,
    clientPrice: "3500.00",
    currency: "EUR",
  },
) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);
  const state = await bookingState(db, hold.bookingId);
  const reservationId = state.booking.providerReservationId;
  if (!reservationId) throw new Error("the hold recorded no reservation id");

  await db.insert(providerReservationEvent).values({
    bookingId: hold.bookingId,
    kind: "extras_updated",
    provider: state.booking.provider,
    providerReference: reservationId,
    payload,
  });

  return { bookingId: hold.bookingId, reservationId, quote: state.quote };
}

function feed(states: ProviderReservationState[]) {
  const asked: (readonly string[] | undefined)[] = [];
  const listChangedReservations: NonNullable<InventoryProvider["listChangedReservations"]> = async (
    window,
  ) => {
    asked.push(window.reservationIds);
    return states;
  };
  Object.assign(inventory, { listChangedReservations });
  return asked;
}

describe("reservation reconcile", () => {
  it("asks about the reservations we hold, and reports a moved week and a new price", async () => {
    const { reservationId, quote } = await heldBooking("moved");
    if (!quote) throw new Error("no quote");
    const asked = feed([
      {
        providerReservationId: reservationId,
        status: "option_held",
        providerStatus: "OPTION",
        externalYachtId: "111",
        checkIn: "2030-01-05",
        checkOut: "2030-01-12",
        priceMinor: 360_000,
        currency: "EUR",
      },
    ]);

    const result = await reconcileReservations(
      test.db,
      inventory,
      new Date("2026-09-21T00:00:00Z"),
    );
    const mine = result.drift.filter((item) => item.providerReservationId === reservationId);

    expect(asked[0]).toContain(reservationId);
    expect(mine.map((item) => item.kind)).toEqual(["dates_changed", "price_changed"]);
    expect(mine[0]?.detail).toBe(`${quote.checkIn}..${quote.checkOut} -> 2030-01-05..2030-01-12`);
  });

  it("reports an operator cancellation as that alone", async () => {
    const { reservationId } = await heldBooking("cancelled");
    feed([
      {
        providerReservationId: reservationId,
        status: "cancelled",
        providerStatus: "STORNO",
        externalYachtId: "222",
        checkIn: "2030-01-05",
      },
    ]);

    const result = await reconcileReservations(
      test.db,
      inventory,
      new Date("2026-09-22T00:00:00Z"),
    );
    const mine = result.drift.filter((item) => item.providerReservationId === reservationId);

    expect(mine.map((item) => item.kind)).toEqual(["cancelled_by_operator"]);
  });

  it("compares against an event in Booking Manager's shape: a digit-string yacht, a number price", async () => {
    const { reservationId } = await heldBooking("bm-shaped", {
      id: "8295147330000100225",
      status: 2,
      yachtId: "207160073500225",
      dateFrom: "2026-10-17 17:00:00",
      dateTo: "2026-10-24 09:00:00",
      expirationDate: "2026-09-25 11:59:26",
      clientPrice: 1700.0,
      currency: "EUR",
      reservationCode: null,
    });
    feed([
      {
        providerReservationId: reservationId,
        status: "option_held",
        providerStatus: "OPTION",
        externalYachtId: "978990020000100225",
        priceMinor: 180_000,
        currency: "EUR",
      },
    ]);

    const result = await reconcileReservations(
      test.db,
      inventory,
      new Date("2026-09-23T00:00:00Z"),
    );
    const mine = result.drift.filter((item) => item.providerReservationId === reservationId);

    expect(mine.map((item) => [item.kind, item.detail])).toEqual([
      ["yacht_changed", "yacht 207160073500225 -> 978990020000100225"],
      ["price_changed", "170000 -> 180000 EUR (minor units)"],
    ]);
  });

  it("reports a hold that ran out at the vendor as lapsed, not as the operator's cancellation", async () => {
    const { reservationId, bookingId } = await heldBooking("lapsed");
    feed([
      {
        providerReservationId: reservationId,
        status: "cancelled",
        providerStatus: "OPTION_EXPIRED",
        lapsed: true,
      },
    ]);

    const result = await reconcileReservations(
      test.db,
      inventory,
      new Date("2026-09-24T00:00:00Z"),
    );
    const mine = result.drift.filter((item) => item.providerReservationId === reservationId);

    expect(mine.map((item) => item.kind)).toEqual(["option_lapsed"]);
    expect((await bookingState(test.db, bookingId)).booking.providerStatus).toBe("OPTION_EXPIRED");
  });
});
