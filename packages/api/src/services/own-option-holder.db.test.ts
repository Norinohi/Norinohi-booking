import "../test-support/checkout-env";

import { booking } from "@yacht-charter/db/schema/booking";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  createBookingManagerBookingService,
  liveBookingHolding,
  type FoundOwnOption,
} from "@yacht-charter/providers/booking-manager/booking";
import { BookingManagerClient } from "@yacht-charter/providers/booking-manager/client";
import type { BookingManagerConfig } from "@yacht-charter/providers/booking-manager/config";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { unscopedCompanies } from "@yacht-charter/providers/shared/company-scope";
import { OWN_OPTION_HELD, SlotUnavailableError } from "@yacht-charter/providers/shared/errors";
import { SequentialQueue } from "@yacht-charter/providers/shared/queue";
import { providerRejection } from "@yacht-charter/providers/testing/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
  WEEK_END,
  WEEK_START,
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

const CHARTER_ID = "8295147330000100225";
const AGENCY_ID = "8295147120000107113";

function found(listingId: string, quoteId: string, reservationIds: string[]): FoundOwnOption {
  return { reservationIds, listingId, checkIn: WEEK_START, checkOut: WEEK_END, quoteId };
}

/** A second customer's quote for the same listing and week as an existing hold. */
async function rivalQuote(slug: string, listingId: string) {
  const userId = await seedCustomer(test.db, `usr_${slug}`);
  return (await quoteWeek(test.db, inventory, listingId, userId)).quoteId;
}

/** A hold whose create has reached the vendor while its answer, and so its ids, has not. */
async function inFlight(bookingId: string) {
  await test.db
    .update(booking)
    .set({
      status: "OPTION_PENDING",
      providerReservationId: null,
      providerOptionId: null,
      providerAgencyReservationId: null,
    })
    .where(eq(booking.id, bookingId));
}

async function listingOf(bookingId: string) {
  const [row] = await test.db
    .select({ listingId: booking.listingId, quoteId: booking.quoteId })
    .from(booking)
    .where(eq(booking.id, bookingId));
  if (!row) throw new Error(`no booking ${bookingId}`);
  return row;
}

describe("liveBookingHolding", () => {
  it("names the live booking holding either of the reservation's ids", async () => {
    const { db } = test;
    const bookingId = await bookingManagerHold("holder");
    const { listingId } = await listingOf(bookingId);
    const other = await rivalQuote("holder_rival", listingId);

    await expect(liveBookingHolding(db, found(listingId, other, [CHARTER_ID]))).resolves.toBe(
      bookingId,
    );
    await expect(liveBookingHolding(db, found(listingId, other, [AGENCY_ID]))).resolves.toBe(
      bookingId,
    );
    await expect(
      liveBookingHolding(db, found(listingId, other, ["8295148140000100225"])),
    ).resolves.toBeUndefined();

    await db.update(booking).set({ status: "OPTION_EXPIRED" }).where(eq(booking.id, bookingId));
    await expect(
      liveBookingHolding(db, found(listingId, other, [CHARTER_ID])),
    ).resolves.toBeUndefined();
  });

  it("counts another checkout of the same week still waiting on its option", async () => {
    const { db } = test;
    const bookingId = await bookingManagerHold("pending");
    const { listingId, quoteId } = await listingOf(bookingId);
    await inFlight(bookingId);
    const other = await rivalQuote("pending_rival", listingId);

    await expect(liveBookingHolding(db, found(listingId, other, [CHARTER_ID]))).resolves.toBe(
      bookingId,
    );
    /* The hold asking is never its own obstacle, or a timed-out create could not be recovered. */
    await expect(
      liveBookingHolding(db, found(listingId, quoteId, [CHARTER_ID])),
    ).resolves.toBeUndefined();
    await expect(
      liveBookingHolding(db, { ...found(listingId, other, [CHARTER_ID]), checkIn: WEEK_END }),
    ).resolves.toBeUndefined();
  });
});

const config: BookingManagerConfig = {
  baseUrl: "https://www.booking-manager.com/api/v2",
  apiToken: "t0ken",
  timeoutMs: 1000,
  syncTimeoutMs: 5000,
  minIntervalMs: 0,
  sweepConcurrency: 1,
  priceWeeksConcurrency: 4,
  optionSafetyMarginMinutes: 15,
  timeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "booking-manager:own-option-holder",
};

/*
 * The vendor on a slot that already carries an option of ours for someone else: POST refuses with
 * "own Option exists", `showOptions` names it, and a DELETE and a second POST would succeed.
 */
function vendorWithOrphan() {
  const calls: string[] = [];
  const option = (id: string) =>
    `{"id":${id},"status":2,"yachtId":207160073500225,"clientName":"First Customer",` +
    `"dateFrom":"${WEEK_START} 17:00:00","dateTo":"${WEEK_END} 09:00:00","currency":"EUR"}`;
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: (url, init) => {
      const method = init.method ?? "GET";
      const path = String(url).slice(config.baseUrl.length + 1);
      calls.push(`${method} ${path.split("?")[0]}`);
      const answer = (status: number, body: string) =>
        Promise.resolve({ status, text: () => Promise.resolve(body) });
      if (method === "POST") return answer(400, "Yacht is not available, own Option exists.");
      if (method === "DELETE") return answer(200, `{"id":${AGENCY_ID},"status":5}`);
      if (path.startsWith("offers?")) {
        return answer(
          200,
          `[{"yachtId":207160073500225,"dateFrom":"${WEEK_START} 17:00:00",` +
            `"dateTo":"${WEEK_END} 09:00:00","status":2,"myReservationId":${AGENCY_ID}}]`,
        );
      }
      if (path === `reservation/${AGENCY_ID}`) {
        return answer(200, `{"id":${AGENCY_ID},"charterReservationId":${CHARTER_ID},"status":2}`);
      }
      if (path === `reservation/${CHARTER_ID}`) return answer(200, option(CHARTER_ID));
      return answer(404, "");
    },
  });
  const service = createBookingManagerBookingService({
    client,
    resolver: {
      providerId: () => Promise.resolve("prv_booking_manager"),
      toExternalListing: () =>
        Promise.resolve({
          externalYachtId: "207160073500225",
          externalCompanyId: "225",
          externalBaseId: "127",
          listingSourceId: "lsrc_pipo",
        }),
      toExternalYachtIds: () => Promise.reject(new Error("not used by createOption")),
      toListingId: () => Promise.reject(new Error("not used by createOption")),
      toExternalCountryId: () => Promise.reject(new Error("not used by createOption")),
      loadListingSummary: () => Promise.reject(new Error("not used by createOption")),
      listExternalCompanyIds: () => Promise.reject(new Error("not used by createOption")),
      listYachtCompanyScopeKeys: () => Promise.reject(new Error("not used by createOption")),
    },
    config,
    db: test.db,
    verifyPrice: () =>
      Promise.resolve({ hash: "agreed", clientPrice: { amountMinor: 170_000, currency: "EUR" } }),
    recordEvent: () => Promise.resolve(),
  });
  return { calls, service };
}

describe("an option of ours found on the slot during another customer's checkout", () => {
  it("is left to the first customer while their create is still in flight", async () => {
    const first = await bookingManagerHold("race");
    const { listingId } = await listingOf(first);
    await inFlight(first);
    const second = await rivalQuote("race_rival", listingId);
    const { calls, service } = vendorWithOrphan();
    const draft = {
      listingId,
      quoteId: second,
      checkIn: WEEK_START,
      checkOut: WEEK_END,
      guests: 2,
      extras: [],
      currency: "EUR",
      priceSourceHash: "agreed",
      customer: { name: "Second", surname: "Customer", email: "second@example.test" },
    };

    const refused = await providerRejection(service.createOption(draft));

    expect(refused).toBeInstanceOf(SlotUnavailableError);
    expect(refused.providerCode).toBe(OWN_OPTION_HELD);
    expect(calls).not.toContain(`DELETE reservation/${CHARTER_ID}`);
    expect(calls.filter((call) => call.startsWith("POST"))).toHaveLength(1);

    /* Once the first checkout has let go, the same option is an orphan and is released. */
    await test.db.update(booking).set({ status: "PROVIDER_REJECTED" }).where(eq(booking.id, first));
    const again = vendorWithOrphan();
    await again.service.createOption(draft).catch(() => undefined);
    expect(again.calls).toContain(`DELETE reservation/${CHARTER_ID}`);
  });
});
