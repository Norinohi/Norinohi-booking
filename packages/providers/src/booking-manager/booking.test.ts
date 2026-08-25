import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { describe, expect, it } from "vitest";
import { z } from "zod";

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

/**
 * Which bases a reservation opens on.
 *
 * The vendor prices a one-way fleet one offer per base pair, so the pair the customer was
 * quoted has to be the pair the reservation names. This sent the listing's own base for both
 * ends regardless, which held the wrong charter whenever the boat was moored elsewhere - the
 * measured case being a hull whose listing says Carrick while every offer that week departed
 * Portumna.
 */
/**
 * The vendor asked us not to send `status` on create: POST can only open an
 * option, so the field decides nothing, and their guidance is explicit about
 * leaving it out (Diego Pacifico, MMK, 2026-08-25). It stays on the update, which
 * is a replace rather than a patch and the one call where the value means
 * something.
 */
describe("reservation body status", () => {
  function capturing() {
    /* Only the fields these tests assert on; `status` stays optional so its
       absence on the create body is what the assertion can see. */
    const bodySchema = z.object({
      status: z.number().optional(),
      passengersOnBoard: z.number().optional(),
      clientName: z.string().optional(),
    });
    const sent: { method: string; body: z.infer<typeof bodySchema> }[] = [];
    const client = new BookingManagerClient({
      config,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
      fetchImpl: (_url, init) => {
        if (init.body !== undefined) {
          const parsed = bodySchema.safeParse(JSON.parse(String(init.body)));
          if (parsed.success) sent.push({ method: init.method ?? "", body: parsed.data });
        }
        return Promise.resolve({
          status: 200,
          text: () =>
            Promise.resolve(`{"id":${AGENCY_ID},"charterReservationId":${CHARTER_ID},"status":1}`),
        });
      },
    });

    const service = createBookingManagerBookingService({
      client,
      resolver: fakeResolver(),
      config,
      db: fakeDb(),
      verifyPrice: () => Promise.resolve(PRICE_HASH),
      recordEvent: () => Promise.resolve(),
    });

    return { sent, service };
  }

  it("omits status when opening an option", async () => {
    const { sent, service } = capturing();

    // The stubbed answer is a confirmed reservation, which createOption rightly
    // refuses; the assertion is on what went out, which is already captured.
    await service.createOption(draft).catch(() => undefined);

    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).not.toHaveProperty("status");
    // The rest of the body is untouched: this is a removal, not a rebuild.
    expect(sent[0]?.body).toMatchObject({ passengersOnBoard: 4, clientName: "Ana Horvat" });
  });

  it("still sends status on the confirming update", async () => {
    const { sent, service } = capturing();

    await service.confirmBooking(draft);

    expect(sent[0]?.method).toBe("PUT");
    expect(sent[0]?.body).toMatchObject({ status: 1 });
  });
});

describe("createOption bases", () => {
  function capturing() {
    /* Only the two fields these tests assert on; the vendor sends ids as bare numbers. */
    const bodySchema = z.object({
      baseFromId: z.number().optional(),
      baseToId: z.number().optional(),
    });
    const sent: z.infer<typeof bodySchema>[] = [];
    const client = new BookingManagerClient({
      config,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
      fetchImpl: (_url, init) => {
        const body: unknown = init.body === undefined ? undefined : JSON.parse(String(init.body));
        const parsed = bodySchema.safeParse(body);
        if (parsed.success) sent.push(parsed.data);
        return Promise.resolve({
          status: 200,
          text: () =>
            Promise.resolve(
              `{"id":${CHARTER_ID},"status":2,"expirationDate":"2027-05-08 12:00:00"}`,
            ),
        });
      },
    });

    const service = createBookingManagerBookingService({
      client,
      resolver: fakeResolver(),
      config,
      db: fakeDb(),
      verifyPrice: () => Promise.resolve(PRICE_HASH),
      recordEvent: () => Promise.resolve(),
    });

    return { sent, service };
  }

  it("opens the reservation on the bases the quote was priced for", async () => {
    const { sent, service } = capturing();
    await service.createOption({
      ...draft,
      route: { startBaseId: "1179998490000100000", endBaseId: "1179998490000100000" },
    });

    expect(sent[0]?.baseFromId).toBe(1179998490000100000);
    expect(sent[0]?.baseToId).toBe(1179998490000100000);
  });

  it("carries a genuine one-way through as two different bases", async () => {
    const { sent, service } = capturing();
    await service.createOption({
      ...draft,
      route: { startBaseId: "1179998490000100000", endBaseId: "1179994180000100000" },
    });

    expect(sent[0]?.baseFromId).toBe(1179998490000100000);
    expect(sent[0]?.baseToId).toBe(1179994180000100000);
  });

  it("falls back to the listing's own base when the offer named none", async () => {
    const { sent, service } = capturing();
    await service.createOption(draft);

    expect(sent[0]?.baseFromId).toBe(194);
    expect(sent[0]?.baseToId).toBe(194);
  });
});
