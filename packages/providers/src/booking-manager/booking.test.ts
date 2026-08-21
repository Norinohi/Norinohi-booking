import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { describe, expect, it } from "vitest";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { unscopedCompanies } from "../shared/company-scope";
import { ContractError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { providerRejection } from "../testing/contracts";
import type { BookingDraft } from "../types";
import { createBookingManagerBookingService } from "./booking";
import { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";

/**
 * Every reservation exists twice on the vendor's side: a charter-side record whose
 * id ends in the charter company's id, and an agency-side twin ending in ours.
 * `POST` answers with the charter-side record; `PUT` and `DELETE` always answer
 * with the agency-side one. These are the real ids measured on company 225.
 *
 * Kept as strings and interpolated into raw JSON text: as JS number literals they
 * would lose precision before `parseExactJson` ever saw them, which is the whole
 * reason that parser exists.
 */
const CHARTER_ID = "8178244520000100225";
const AGENCY_ID = "8178244250000107113";

const config: BookingManagerConfig = {
  baseUrl: "https://www.booking-manager.com/api/v2",
  apiToken: "t0ken",
  timeoutMs: 1000,
  minIntervalMs: 0,
  sweepConcurrency: 1,
  optionSafetyMarginMinutes: 15,
  timeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "booking-manager:test",
};

const PRICE_HASH = "hash-the-customer-agreed-to";

const draft: BookingDraft = {
  listingId: "ylst_bm_1",
  quoteId: "qte_1",
  checkIn: "2027-05-15",
  checkOut: "2027-05-22",
  guests: 4,
  extras: [],
  priceSourceHash: PRICE_HASH,
  customer: { name: "Ana", surname: "Horvat", email: "ana.horvat@example.com" },
  reservation: { providerReservationId: CHARTER_ID },
};

type ReservationEventRow = typeof providerReservationEvent.$inferInsert;
type BookingUpdate = Partial<typeof booking.$inferInsert>;

/** Enough of the Drizzle executor for the default event recorder. */
function fakeDb(): Database {
  // SAFETY: a stub executor with nothing behind it. Only the builders the default
  // recorder reaches for are implemented, so any other Drizzle call is a TypeError
  // rather than a quietly wrong answer.
  return Object.assign({} as Database, {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([{ id: "bkg_1", quoteId: "qte_1" }]) }),
      }),
    }),
    insert: () => ({ values: (_row: ReservationEventRow) => Promise.resolve() }),
    update: () => ({ set: (_value: BookingUpdate) => ({ where: () => Promise.resolve() }) }),
  });
}

function fakeResolver(): CatalogueResolver {
  return {
    providerId: () => Promise.resolve("prv_booking_manager"),
    toExternalListing: () =>
      Promise.resolve({
        externalYachtId: "978990780000100225",
        externalCompanyId: "225",
        externalBaseId: "194",
        listingSourceId: "lsrc_1",
      }),
    toExternalYachtIds: () => Promise.resolve(new Map<string, string>()),
    toListingId: () => Promise.resolve("ylst_bm_1"),
    toExternalAmenityIds: (codes) => Promise.resolve(codes.map((code) => code.split(":")[1] ?? "")),
    toExternalCountryId: () => Promise.resolve(null),
    // The confirm path never reaches these. Rejecting rather than returning an
    // empty answer keeps a future caller from reading "no companies" as data.
    loadListingSummary: () => Promise.reject(new Error("not used by confirmBooking")),
    listExternalCompanyIds: () => Promise.reject(new Error("not used by confirmBooking")),
    listYachtCompanyScopeKeys: () => Promise.reject(new Error("not used by confirmBooking")),
  };
}

/**
 * Answers any PUT with one reservation payload, so confirm can be driven alone.
 * `body` is raw JSON text rather than an object, so the 19-digit ids reach
 * `parseExactJson` with every digit intact.
 */
function serviceAnswering(body: string) {
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: () => Promise.resolve({ status: 200, text: () => Promise.resolve(body) }),
  });

  return createBookingManagerBookingService({
    client,
    resolver: fakeResolver(),
    config,
    db: fakeDb(),
    verifyPrice: () => Promise.resolve(PRICE_HASH),
    recordEvent: () => Promise.resolve(),
  });
}

describe("confirmBooking", () => {
  it("accepts the agency-side twin the vendor answers a PUT with", async () => {
    // Measured 2026-08-20: PUT on the charter id answered with the agency id
    // carrying charterReservationId back to it. An equality check against the id
    // we addressed rejected every real confirmation.
    const reservation = await serviceAnswering(
      `{"id":${AGENCY_ID},"charterReservationId":${CHARTER_ID},"reservationCode":"27-00009","status":1}`,
    ).confirmBooking(draft);

    expect(reservation.status).toBe("confirmed");
  });

  it("keeps the charter-side id as the handle across the lifecycle", async () => {
    const reservation = await serviceAnswering(
      `{"id":${AGENCY_ID},"charterReservationId":${CHARTER_ID},"status":1}`,
    ).confirmBooking(draft);

    // Switching to the id PUT happens to answer with would change the key
    // mid-lifecycle, orphaning the option this booking grew out of.
    expect(reservation.providerReservationId).toBe(CHARTER_ID);
    expect(reservation.id).toBe(CHARTER_ID);
  });

  it("still refuses a response for an unrelated reservation", async () => {
    const error = await providerRejection(
      serviceAnswering(
        `{"id":8178261650000100225,"charterReservationId":8178261410000107113,"status":1}`,
      ).confirmBooking(draft),
    );

    expect(error).toBeInstanceOf(ContractError);
  });
});
