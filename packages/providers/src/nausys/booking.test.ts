import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { AuthError, ContractError, NotFoundError } from "../shared/errors";
import type { JsonObject } from "../shared/json";
import { SequentialQueue } from "../shared/queue";
import type { BookingDraft } from "../types";
import type { QuoteReservationEventInput } from "../shared/reservation-log";
import {
  createNausysBookingService,
  splitCustomerName,
  type NausysBookingServiceDeps,
} from "./booking";
import { NausysClient } from "./client";
import { restYachtReservationResponseSchema } from "./endpoints";
import type { NausysConfig } from "./config";
import { FakeNausysTransport, nausysFixtures } from "./testing/fake-transport";

const config: NausysConfig = {
  baseUrl: "https://ws-test.nausys.com",
  username: "agency-user",
  password: "hunter2",
  timeoutMs: 1000,
  minIntervalMs: 0,
  optionSafetyMarginMinutes: 15,
  optionTimeZone: "Europe/Zagreb",
  queueKey: "nausys:agency-user",
};

const PRICE_HASH = "hash-the-customer-agreed-to";

const INFO_UUID = "0f1b7d4c-info-4a11-9d3e-000000000001";
const OPTION_UUID = "7c2a9e55-optn-4b22-8e7f-000000000002";
const BOOKING_UUID = "b93f10ad-book-4c33-91aa-000000000003";
const STORNO_UUID = "e5417cc0-strn-4d44-84bb-000000000004";
const RESERVATION_ID = "55901234";

const draft: BookingDraft = {
  listingId: "ylst_adriatic_1",
  quoteId: "qte_1",
  checkIn: "2026-07-04",
  checkOut: "2026-07-11",
  guests: 6,
  extras: [],
  priceSourceHash: PRICE_HASH,
  customer: {
    name: "Ana Horvat",
    email: "ana.horvat@example.com",
    phone: "+385 91 000 0000",
  },
};

const heldDraft: BookingDraft = {
  ...draft,
  reservation: {
    providerReservationId: RESERVATION_ID,
    providerOptionId: RESERVATION_ID,
    securityToken: OPTION_UUID,
  },
};

function fakeResolver(): CatalogueResolver {
  return {
    providerId: () => Promise.resolve("prv_nausys"),
    toExternalListing: () =>
      Promise.resolve({
        externalYachtId: "4711001",
        externalCompanyId: "102701",
        externalBaseId: "1002",
        listingSourceId: "lsrc_1",
      }),
    toListingId: () => Promise.resolve("ylst_adriatic_1"),
    toExternalAmenityIds: (codes) => Promise.resolve(codes.map((code) => code.split(":")[1] ?? "")),
    /* The vendor's real Croatia id, so a mapped payload is recognisable. */
    toExternalCountryId: (isoCode) => Promise.resolve(isoCode.toUpperCase() === "HR" ? "1" : null),
    loadListingSummary: () => Promise.resolve(null),
    listExternalCompanyIds: () => Promise.resolve([]),
  };
}

type ReservationEventRow = typeof providerReservationEvent.$inferInsert;
type BookingUpdate = Partial<typeof booking.$inferInsert>;

/** Enough of the Drizzle executor for the default recorder and token sink. */
function fakeDb() {
  const inserted: ReservationEventRow[] = [];
  const updated: BookingUpdate[] = [];
  // SAFETY: a stub executor with nothing behind it. Only the three builders the
  // default recorder and the token sink reach for are implemented, so any other
  // Drizzle call is a TypeError rather than a quietly wrong answer.
  const db = Object.assign({} as Database, {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "bkg_1", quoteId: "qte_1" }]),
        }),
      }),
    }),
    insert: () => ({
      values: (value: ReservationEventRow) => {
        inserted.push(value);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (value: BookingUpdate) => ({
        where: () => {
          updated.push(value);
          return Promise.resolve();
        },
      }),
    }),
  });

  return { db, inserted, updated };
}

function build(overrides: Partial<NausysBookingServiceDeps> = {}) {
  const transport = new FakeNausysTransport();
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });

  const events: QuoteReservationEventInput[] = [];
  const rotations: { providerReservationId: string; securityToken: string }[] = [];
  const { db } = fakeDb();

  const service = createNausysBookingService({
    client,
    resolver: fakeResolver(),
    config,
    db,
    verifyPrice: () => Promise.resolve(PRICE_HASH),
    recordEvent: (event) => {
      events.push(event);
      return Promise.resolve();
    },
    persistSecurityToken: (rotation) => {
      rotations.push(rotation);
      return Promise.resolve();
    },
    ...overrides,
  });

  return { service, transport, events, rotations };
}

const fixtureBodySchema = z.record(z.string(), z.json());

/** Fixture body with the fields a test wants changed. */
function fixture(key: string, patch: JsonObject = {}): JsonObject {
  return { ...fixtureBodySchema.parse(nausysFixtures[key]), ...patch };
}

describe("the mandatory three-step chain", () => {
  it("runs createInfo then createOption then createBooking, in order", async () => {
    const { service, transport } = build();

    const held = await service.createOption(draft);
    await service.confirmBooking({
      ...draft,
      reservation: {
        providerReservationId: held.providerReservationId ?? "",
        providerOptionId: held.providerOptionId ?? "",
        securityToken: held.securityToken ?? "",
      },
    });

    expect(transport.callSequence()).toEqual(["createInfo", "createOption", "createBooking"]);
  });

  it("never skips createInfo: one hold is exactly one info plus one option", async () => {
    const { service, transport } = build();

    await service.createOption(draft);

    expect(transport.callSequence()).toEqual(["createInfo", "createOption"]);
    expect(transport.callCount("createInfo")).toBe(1);
    expect(transport.callCount("createOption")).toBe(1);
  });

  it("confirming re-uses the existing reservation instead of opening a second one", async () => {
    const { service, transport } = build();

    await service.confirmBooking(heldDraft);

    expect(transport.callSequence()).toEqual(["createBooking"]);
  });

  it("returns the option handle with the vendor's own expiry and a single id", async () => {
    const { service } = build();

    const held = await service.createOption(draft);

    expect(held).toMatchObject({
      provider: "nausys",
      listingId: "ylst_adriatic_1",
      quoteId: "qte_1",
      status: "option_held",
      providerReservationId: RESERVATION_ID,
      providerOptionId: RESERVATION_ID,
    });
  });

  it("maps a committed reservation to confirmed", async () => {
    const { service } = build();

    const confirmed = await service.confirmBooking(heldDraft);

    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.providerReservationId).toBe(RESERVATION_ID);
  });
});

describe("the uuid funnel", () => {
  it("sends the uuid the previous step returned, never the original", async () => {
    const { service, transport } = build();

    const held = await service.createOption(draft);
    const confirmed = await service.confirmBooking({
      ...draft,
      reservation: {
        providerReservationId: held.providerReservationId ?? "",
        securityToken: held.securityToken ?? "",
      },
    });

    // createInfo opens the reservation, so it carries no handle at all.
    expect(transport.lastBody("createInfo")).not.toHaveProperty("uuid");
    expect(transport.lastBody("createOption")).toMatchObject({ id: 55901234, uuid: INFO_UUID });
    expect(transport.lastBody("createBooking")).toMatchObject({ id: 55901234, uuid: OPTION_UUID });

    expect(held.securityToken).toBe(OPTION_UUID);
    expect(confirmed.securityToken).toBe(BOOKING_UUID);
  });

  /* A JSON boolean here is a vendor-side HTTP 500: their DTO deserializes it as a String. */
  it("sends createWaitingOption as a string, never a boolean", async () => {
    const { service, transport } = build();

    await service.createOption(draft);

    expect(transport.lastBody("createOption")).toMatchObject({ createWaitingOption: "false" });
  });

  it("hands every refreshed token to the persistence sink", async () => {
    const { service, rotations } = build();

    await service.createOption(draft);
    await service.confirmBooking(heldDraft);

    expect(rotations).toEqual([
      { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      { providerReservationId: RESERVATION_ID, securityToken: BOOKING_UUID },
    ]);
  });

  it("rotates on an extras mutation, the one path whose DTO cannot carry the token", async () => {
    const { service, transport, rotations } = build();
    const rotated = "aa11bb22-xtra-4e55-9fcc-000000000005";
    transport.respondWith("addExtras", fixture("createOption", { uuid: rotated }));

    await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001"],
    });

    // A reservation with no extras yet: everything desired is an addition, and
    // `addExtras` is keyed by the catalogue service id.
    expect(transport.lastBody("addExtras")).toMatchObject({
      id: 55901234,
      uuid: OPTION_UUID,
      services: [{ serviceId: 8001, quantity: 1 }],
    });
    expect(rotations).toEqual([{ providerReservationId: RESERVATION_ID, securityToken: rotated }]);
  });

  it("adds only what the reservation does not already carry", async () => {
    const { service, transport } = build({
      loadReservationExtras: () =>
        Promise.resolve([
          { yachtReservationServiceId: 991, serviceId: 8001, quantity: 1, editable: true },
        ]),
    });
    transport.respondWith("addExtras", fixture("createOption"));

    await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001", "nausys:8002"],
    });

    expect(transport.lastBody("addExtras")).toMatchObject({
      services: [{ serviceId: 8002, quantity: 1 }],
    });
  });

  it("refuses to drop an extra, because the vendor offers no way to remove one", async () => {
    // updateExtras is a partial update, so a deselected extra would silently stay
    // on the booking and keep being billed. Failing is the honest outcome.
    const { service, transport } = build({
      loadReservationExtras: () =>
        Promise.resolve([
          { yachtReservationServiceId: 991, serviceId: 8001, quantity: 1, editable: true },
        ]),
    });

    await expect(
      service.addOrUpdateExtras({
        ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
        extras: [],
      }),
    ).rejects.toThrow(/no way to remove/);

    expect(transport.calls).toHaveLength(0);
  });

  it("refuses to touch a line the operator locked", async () => {
    const { service } = build({
      loadReservationExtras: () =>
        Promise.resolve([
          { yachtReservationServiceId: 991, serviceId: 8001, quantity: 1, editable: false },
        ]),
    });

    await expect(
      service.addOrUpdateExtras({
        ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
        extras: ["nausys:8001"],
      }),
    ).rejects.toThrow(/locked/);
  });

  it("refuses to call the vendor with a missing uuid", async () => {
    const { service, transport } = build();

    await expect(
      service.confirmBooking({
        ...draft,
        reservation: { providerReservationId: RESERVATION_ID },
      }),
    ).rejects.toBeInstanceOf(ContractError);

    await expect(service.cancelOption({ providerReservationId: RESERVATION_ID })).rejects.toThrow(
      /rotating uuid/,
    );

    expect(transport.calls).toHaveLength(0);
  });

  it("refuses to confirm a draft that never held an option", async () => {
    const { service, transport } = build();

    await expect(service.confirmBooking(draft)).rejects.toThrow(
      /needs the reservation the option step opened/,
    );
    expect(transport.calls).toHaveLength(0);
  });

  it("refuses a reservation id NauSYS could not have issued", async () => {
    const { service, transport } = build();

    await expect(
      service.cancelOption({ providerReservationId: "res_abc", securityToken: OPTION_UUID }),
    ).rejects.toThrow(/numeric reservation id/);
    expect(transport.calls).toHaveLength(0);
  });

  it("fails when the vendor answers for a different reservation", async () => {
    const { service, transport } = build();
    transport.respondWith("createBooking", fixture("createBooking", { id: 99999999 }));

    await expect(service.confirmBooking(heldDraft)).rejects.toThrow(/not 55901234/);
  });

  it("fails when a response carries no uuid to carry forward", async () => {
    const { service, transport } = build();
    transport.respondWith("createInfo", fixture("createInfo", { uuid: "" }));

    await expect(service.createOption(draft)).rejects.toThrow(/returned no uuid/);
    expect(transport.callSequence()).toEqual(["createInfo"]);
  });
});

describe("option expiry", () => {
  it("subtracts the safety margin from the vendor's optionTill", async () => {
    const { service } = build();

    const held = await service.createOption(draft);

    // 12.02.2026 18:00 in Europe/Zagreb is 17:00Z; the 15 minute margin makes it 16:45Z.
    expect(held.holdExpiresAt).toBe("2026-02-12T16:45:00.000Z");
  });

  it("honours a different margin and zone", async () => {
    const { service } = build({
      config: { ...config, optionSafetyMarginMinutes: 60, optionTimeZone: "UTC" },
    });

    const held = await service.createOption(draft);

    expect(held.holdExpiresAt).toBe("2026-02-12T17:00:00.000Z");
  });

  it("refuses a hold the provider gave no expiry for", async () => {
    const { service, transport } = build();
    const { optionTill: _dropped, ...withoutExpiry } = fixtureBodySchema.parse(
      nausysFixtures.createOption,
    );
    transport.respondWith("createOption", withoutExpiry);

    await expect(service.createOption(draft)).rejects.toThrow(/no optionTill/);
  });
});

describe("price revalidation before the hold", () => {
  it("refuses to hold when the price source hash moved, without calling the vendor", async () => {
    const { service, transport, events } = build({
      verifyPrice: () => Promise.resolve("a-different-hash"),
    });

    await expect(service.createOption(draft)).rejects.toThrow(/PRICE_CHANGED/);
    expect(transport.calls).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it("holds when the hash still matches", async () => {
    const { service, transport } = build();

    await service.createOption(draft);

    expect(transport.callCount("createOption")).toBe(1);
  });
});

describe("storno", () => {
  it("maps stornoOption to a cancelled reservation carrying the new token", async () => {
    const { service, transport } = build();

    const cancelled = await service.cancelOption({
      providerReservationId: RESERVATION_ID,
      securityToken: OPTION_UUID,
    });

    expect(transport.lastBody("stornoOption")).toMatchObject({
      id: 55901234,
      uuid: OPTION_UUID,
    });
    expect(cancelled).toMatchObject({
      provider: "nausys",
      status: "cancelled",
      providerReservationId: RESERVATION_ID,
      securityToken: STORNO_UUID,
    });
  });
});

describe("reservation events", () => {
  it("logs info_created then option_created against the quote", async () => {
    const { service, events } = build();

    await service.createOption(draft);

    expect(events.map((event) => event.kind)).toEqual(["info_created", "option_created"]);
    expect(events[0]).toMatchObject({ quoteId: "qte_1", providerReference: RESERVATION_ID });
  });

  it("keeps the leaked INFO record but attempts no compensation", async () => {
    const { service, transport, events } = build();
    transport.failWith("createOption", "error-100");

    await expect(service.createOption(draft)).rejects.toBeInstanceOf(AuthError);

    expect(events.map((event) => event.kind)).toEqual(["info_created"]);
    expect(transport.callSequence()).toEqual(["createInfo", "createOption"]);
    expect(transport.callCount("stornoOption")).toBe(0);
  });

  it("writes a booking-scoped, PII-free row through the default recorder", async () => {
    const { db, inserted } = fakeDb();
    const transport = new FakeNausysTransport();
    const service = createNausysBookingService({
      client: new NausysClient({
        config,
        fetchImpl: transport.fetch,
        queue: new SequentialQueue(),
        retry: { maxAttempts: 1 },
      }),
      resolver: fakeResolver(),
      config,
      db,
      verifyPrice: () => Promise.resolve(PRICE_HASH),
      persistSecurityToken: () => Promise.resolve(),
    });

    await service.createOption(draft);

    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      bookingId: "bkg_1",
      kind: "info_created",
      provider: "nausys",
      providerReference: RESERVATION_ID,
    });
    expect(JSON.stringify(inserted)).not.toContain("Horvat");
    expect(JSON.stringify(inserted)).not.toContain("example.com");
  });
});

describe("agencyPrice never leaves the adapter", () => {
  it("is absent from every returned DTO and every logged event", async () => {
    const { service, events, transport } = build();
    transport.respondWith("addExtras", fixture("createOption"));

    const held = await service.createOption(draft);
    const confirmed = await service.confirmBooking(heldDraft);
    const cancelled = await service.cancelOption({
      providerReservationId: RESERVATION_ID,
      securityToken: BOOKING_UUID,
    });
    const repriced = await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: STORNO_UUID },
      extras: ["nausys:8001"],
    });

    const serialized = JSON.stringify({ held, confirmed, cancelled, repriced, events });
    expect(serialized).not.toContain("agencyPrice");
    // The fixture's agency price, which must never appear as a mapped amount.
    expect(serialized).not.toContain("2839");
    expect(serialized).not.toContain("283900");
  });
});

describe("extras mutation pricing", () => {
  it("re-reads the price from the mutation response", async () => {
    const { service, transport } = build();
    transport.respondWith("addExtras", fixture("createOption"));

    const quote = await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001"],
    });

    expect(quote.currency).toBe("EUR");
    expect(quote.lines[0]).toMatchObject({
      kind: "base",
      amount: { amountMinor: 334_000, currency: "EUR" },
    });
    expect(quote.lines[1]).toMatchObject({
      code: "nausys:8001",
      payWhen: "at_check_in",
      amount: { amountMinor: 15_000, currency: "EUR" },
    });
    expect(quote.total.amountMinor).toBe(349_000);
    expect(quote.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    // Two instalments on the vendor side, so the deposit is not hardcoded to half.
    expect(quote.paymentPolicy).toEqual({ mode: "deposit", depositPct: 0.5 });
    expect(quote.checkIn).toBe("2026-07-04");
  });

  it("produces a hash that ignores the rotating uuid", async () => {
    const { service, transport } = build();
    transport.respondWith("addExtras", fixture("createOption"));
    const first = await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001"],
    });

    transport.respondWith("addExtras", fixture("createOption", { uuid: "a-new-token" }));
    const second = await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001"],
    });

    expect(second.priceSourceHash).toBe(first.priceSourceHash);

    transport.respondWith("addExtras", fixture("createOption", { clientPrice: "3540.00" }));
    const third = await service.addOrUpdateExtras({
      ref: { providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID },
      extras: ["nausys:8001"],
    });

    expect(third.priceSourceHash).not.toBe(first.priceSourceHash);
  });
});

describe("vendor error mapping", () => {
  it("maps an unknown yacht on createInfo to NotFoundError and stops there", async () => {
    const { service, transport, events } = build();
    transport.failWith("createInfo", "error-402");

    await expect(service.createOption(draft)).rejects.toBeInstanceOf(NotFoundError);
    expect(transport.callSequence()).toEqual(["createInfo"]);
    expect(events).toEqual([]);
  });

  it("maps missing client data on createBooking to ContractError", async () => {
    const { service, transport } = build();
    transport.failWith("createBooking", "error-201");

    await expect(service.confirmBooking(heldDraft)).rejects.toBeInstanceOf(ContractError);
  });

  it("maps an authentication failure to AuthError", async () => {
    const { service, transport } = build();
    transport.failWith("stornoOption", "error-100");

    await expect(
      service.cancelOption({ providerReservationId: RESERVATION_ID, securityToken: OPTION_UUID }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("createInfo client mapping", () => {
  it("splits a single full-name field into name and surname", () => {
    expect(splitCustomerName("Ana Horvat")).toEqual({ name: "Ana", surname: "Horvat" });
    expect(splitCustomerName("Ana Maria Horvat")).toEqual({
      name: "Ana Maria",
      surname: "Horvat",
    });
    expect(splitCustomerName("Ana", "Horvat")).toEqual({ name: "Ana", surname: "Horvat" });
  });

  it("repeats a single token rather than sending an empty surname", () => {
    expect(splitCustomerName("Ana")).toEqual({ name: "Ana", surname: "Ana" });
    expect(splitCustomerName("  ")).toEqual({ name: "", surname: "" });
  });

  it("sends the vendor's capital-D yachtID and the split client", async () => {
    const { service, transport } = build();

    await service.createOption(draft);

    expect(transport.lastBody("createInfo")).toEqual({
      credentials: { username: "agency-user", password: "hunter2" },
      client: {
        name: "Ana",
        surname: "Horvat",
        email: "ana.horvat@example.com",
        phone: "+385 91 000 0000",
        mobile: "+385 91 000 0000",
      },
      periodFrom: "04.07.2026",
      periodTo: "11.07.2026",
      yachtID: 4711001,
    });
  });

  it("maps the customer's ISO country code to the vendor's countryId", async () => {
    const { service, transport } = build();

    await service.createOption({
      ...draft,
      customer: { ...draft.customer, countryCode: "hr", city: "Zagreb" },
    });

    const body = z
      .object({ client: z.record(z.string(), z.json()) })
      .parse(transport.lastBody("createInfo"));
    expect(body.client.countryId).toBe(1);
    expect(body.client.city).toBe("Zagreb");
  });

  it("refuses to open a reservation when the country code resolves to nothing", async () => {
    const { service, transport } = build();

    await expect(
      service.createOption({ ...draft, customer: { ...draft.customer, countryCode: "ZZ" } }),
    ).rejects.toThrow(/ZZ/);

    expect(transport.lastBody("createInfo")).toBeUndefined();
  });
});

describe("blank client fields on a reservation response", () => {
  /*
   * Observed live on createInfo: a private booking comes back with `company: false`
   * rather than "" or an omitted key, which failed the whole response and rejected the
   * hold. Absent is the only sane reading of it.
   */
  const reservation = {
    status: "OK",
    id: 55901234,
    uuid: INFO_UUID,
    reservationStatus: "INFO",
    yachtId: 4711001,
    periodFrom: "04.07.2026",
    periodTo: "11.07.2026",
  };

  it("reads a false client field as absent", () => {
    const parsed = restYachtReservationResponseSchema.parse({
      ...reservation,
      client: { name: "Ana", surname: "Horvat", company: false, vatNr: false },
    });

    expect(parsed.client?.company).toBeUndefined();
    expect(parsed.client?.vatNr).toBeUndefined();
    expect(parsed.client?.name).toBe("Ana");
  });

  it("still rejects a true, which would be a value rather than a blank", () => {
    expect(() =>
      restYachtReservationResponseSchema.parse({ ...reservation, client: { company: true } }),
    ).toThrow();
  });
});
