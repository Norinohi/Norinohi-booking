import { readFileSync } from "node:fs";

import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { unscopedCompanies } from "../shared/company-scope";
import {
  ContractError,
  OWN_OPTION_HELD,
  PRODUCT_NOT_OFFERED,
  refusesOnlyTheTerms,
  SlotUnavailableError,
  TransientError,
} from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { providerRejection } from "../testing/contracts";
import type { BookingDraft, Money } from "../types";
import { createBookingManagerBookingService, operatorSettlementOf } from "./booking";
import { restReservationSchema } from "./endpoints";
import { parseExactJson } from "../shared/exact-json";
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
  syncTimeoutMs: 5000,
  minIntervalMs: 0,
  sweepConcurrency: 1,
  priceWeeksConcurrency: 4,
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
    verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }),
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

/*
 * NB-TBV6TK43: the option came back 17:00 to 09:00 while the site showed the base's 12:00, filled
 * from whichever yacht at that marina synced first. The option is the operator's own word.
 */
describe("createOption handover times", () => {
  it("carries the times the vendor put on the option", async () => {
    const reservation = await serviceAnswering(
      `{"id":${CHARTER_ID},"status":2,"dateFrom":"2027-05-15 17:00:00","dateTo":"2027-05-22 09:00:00","expirationDate":"2027-04-01 23:59:14"}`,
    ).createOption(draft);

    expect(reservation).toMatchObject({ checkInTime: "17:00", checkOutTime: "09:00" });
  });

  it("states none where the option carries a bare date", async () => {
    const reservation = await serviceAnswering(
      `{"id":${CHARTER_ID},"status":2,"dateFrom":"2027-05-15","expirationDate":"2027-04-01 23:59:14"}`,
    ).createOption(draft);

    expect(reservation.checkInTime).toBeUndefined();
    expect(reservation.checkOutTime).toBeUndefined();
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
      verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }),
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

describe("createOption product", () => {
  it("names the listing's product on the reservation", async () => {
    const sent: string[] = [];
    const client = new BookingManagerClient({
      config,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
      fetchImpl: (_url, init) => {
        const parsed = z
          .object({ productName: z.string() })
          .safeParse(init.body === undefined ? undefined : JSON.parse(String(init.body)));
        if (parsed.success) sent.push(parsed.data.productName);
        return Promise.resolve({
          status: 200,
          text: () =>
            Promise.resolve(
              `{"id":${CHARTER_ID},"status":2,"expirationDate":"2027-05-08 12:00:00"}`,
            ),
        });
      },
    });
    const asked: string[] = [];

    await createBookingManagerBookingService({
      client,
      resolver: fakeResolver(),
      config,
      db: fakeDb(),
      verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }),
      recordEvent: () => Promise.resolve(),
      loadProductName: (externalYachtId) => {
        asked.push(externalYachtId);
        return Promise.resolve("Bareboat");
      },
    }).createOption(draft);

    expect(asked).toEqual(["978990780000100225"]);
    expect(sent).toEqual(["Bareboat"]);
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
      verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }),
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

  /* Marina Cienfuegos on company 225 is base 0; a falsy check would fall back to the listing's. */
  it("sends base 0 as base 0", async () => {
    const { sent, service } = capturing();
    await service.createOption({ ...draft, route: { startBaseId: "0", endBaseId: "0" } });

    expect(sent[0]?.baseFromId).toBe(0);
    expect(sent[0]?.baseToId).toBe(0);
  });

  it("falls back to the listing's own base when the offer named none", async () => {
    const { sent, service } = capturing();
    await service.createOption(draft);

    expect(sent[0]?.baseFromId).toBe(194);
    expect(sent[0]?.baseToId).toBe(194);
  });
});

/*
 * What POST /reservation answered on company 225 on 22 September 2026, trimmed of the client's
 * name, the crew-list link and the bank details. Asked for Pipo 127 to 136 in EUR, it opened
 * 127 to 127 without a word; asked in USD, it opened the same charter in EUR.
 */
const PIPO = "207160073500225";
const PIPO_OPTION = "8295148140000100225";
const pipoAnswer = (overrides = "") =>
  `{"id":${PIPO_OPTION},"reservationCode":"26-01251","dateFrom":"2026-10-17 17:00:00",` +
  `"dateTo":"2026-10-24 09:00:00","expirationDate":"2026-09-25 11:59:09","yachtId":${PIPO},` +
  `"status":2,"productName":"Bareboat","baseFromId":127,"baseToId":127,"currency":"EUR",` +
  `"basePrice":1700.0,"discount":0.0,"commission":255.0,"finalPrice":1445.0,"clientPrice":1700.0` +
  `${overrides}}`;

const pipoDraft: BookingDraft = {
  ...draft,
  checkIn: "2026-10-17",
  checkOut: "2026-10-24",
  guests: 2,
  currency: "EUR",
  route: { startBaseId: "127", endBaseId: "127" },
};

function substitutionService(
  answer: string,
  options: { deleteFails?: boolean; yachtId?: string; baseId?: string; clientPrice?: Money } = {},
) {
  const calls: { method: string; url: string; body: string | undefined }[] = [];
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: (url, init) => {
      const method = init.method ?? "GET";
      calls.push({
        method,
        url: String(url),
        body: init.body === undefined ? undefined : String(init.body),
      });
      if (method === "DELETE" && options.deleteFails) {
        return Promise.resolve({ status: 500, text: () => Promise.resolve("down") });
      }
      return Promise.resolve({
        status: method === "POST" ? 201 : 200,
        text: () =>
          Promise.resolve(method === "POST" ? answer : `{"id":${PIPO_OPTION},"status":5}`),
      });
    },
  });
  const service = createBookingManagerBookingService({
    client,
    resolver: {
      ...fakeResolver(),
      toExternalListing: () =>
        Promise.resolve({
          externalYachtId: options.yachtId ?? PIPO,
          externalCompanyId: "225",
          externalBaseId: options.baseId ?? "127",
          listingSourceId: "lsrc_pipo",
        }),
    },
    config,
    db: fakeDb(),
    verifyPrice: () =>
      Promise.resolve({
        hash: PRICE_HASH,
        clientPrice: options.clientPrice ?? { amountMinor: 170_000, currency: "EUR" },
      }),
    recordEvent: () => Promise.resolve(),
    loadProductName: () => Promise.resolve("Bareboat"),
  });
  return { calls, service };
}

describe("createOption against what the vendor opened", () => {
  it("keeps an option opened exactly as asked", async () => {
    const { calls, service } = substitutionService(pipoAnswer());

    const reservation = await service.createOption(pipoDraft);

    expect(reservation.providerReservationId).toBe(PIPO_OPTION);
    expect(calls.map((call) => call.method)).toEqual(["POST"]);
  });

  it("releases and refuses a one-way the vendor opened as a round trip", async () => {
    const { calls, service } = substitutionService(pipoAnswer());

    const error = await providerRejection(
      service.createOption({ ...pipoDraft, route: { startBaseId: "127", endBaseId: "136" } }),
    );

    expect(error).toBeInstanceOf(ContractError);
    expect(error.providerCode).toBe("RESERVATION_SUBSTITUTED");
    expect(error.message).toMatch(/baseToId 136 became 127/);
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
    expect(calls[1]?.url).toContain(`/reservation/${PIPO_OPTION}`);
  });

  it("sends the quote's currency, and refuses the option opened in another", async () => {
    const { calls, service } = substitutionService(pipoAnswer());

    const error = await providerRejection(service.createOption({ ...pipoDraft, currency: "USD" }));

    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ currency: "USD" });
    expect(error.message).toMatch(/currency USD became EUR/);
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
  });

  it("refuses an option priced other than the charter it re-priced", async () => {
    const { service } = substitutionService(
      pipoAnswer().replace('"clientPrice":1700.0', '"clientPrice":1850.0'),
    );

    const error = await providerRejection(service.createOption(pipoDraft));

    expect(error.message).toMatch(/clientPrice 170000 became 185000/);
  });

  /*
   * West Wind's option on 225 (reservation 8192657220000107113, trimmed to what is compared): a
   * 1.00 charter answered at 501.00, because POST adds the obligatory APA paid online. The extras
   * paid at the base are listed beside it and left out of the figure.
   */
  const westWindAnswer =
    `{"id":${PIPO_OPTION},"dateFrom":"2026-10-31 17:00:00","dateTo":"2026-11-07 09:00:00",` +
    `"expirationDate":"2026-09-25 11:59:09",` +
    `"yachtId":978989630000100225,"status":2,"productName":"Bareboat","baseFromId":194,` +
    `"baseToId":194,"currency":"EUR","basePrice":1.0,"discount":0.0,"commission":0.0,` +
    `"finalPrice":501.0,"clientPrice":501.0,"items":[` +
    `{"name":"APA ","price":500.0,"payableInBase":false,"type":"extra"},` +
    `{"name":"Cleaning","price":100.0,"payableInBase":true,"type":"extra"},` +
    `{"name":"Skipper","price":910.0,"payableInBase":true,"type":"extra"}]}`;
  const westWindDraft: BookingDraft = {
    ...pipoDraft,
    checkIn: "2026-10-31",
    checkOut: "2026-11-07",
    route: { startBaseId: "194", endBaseId: "194" },
  };

  it("keeps an option whose price carries the obligatory extras paid online", async () => {
    const { calls, service } = substitutionService(westWindAnswer, {
      yachtId: "978989630000100225",
      baseId: "194",
      clientPrice: { amountMinor: 100 + 50_000, currency: "EUR" },
    });

    await expect(service.createOption(westWindDraft)).resolves.toMatchObject({
      providerReservationId: PIPO_OPTION,
    });
    expect(calls.map((call) => call.method)).toEqual(["POST"]);
  });

  it("still refuses one that left out an extra it should have charged online", async () => {
    const { calls, service } = substitutionService(
      westWindAnswer.replace('"clientPrice":501.0', '"clientPrice":1.0'),
      {
        yachtId: "978989630000100225",
        baseId: "194",
        clientPrice: { amountMinor: 100 + 50_000, currency: "EUR" },
      },
    );

    const error = await providerRejection(service.createOption(westWindDraft));

    expect(error.message).toMatch(/clientPrice 50100 became 100/);
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
  });

  it("refuses another product whatever case it is spelled in", async () => {
    const same = substitutionService(pipoAnswer().replace('"Bareboat"', '"BAREBOAT"'));
    await expect(same.service.createOption(pipoDraft)).resolves.toMatchObject({
      providerReservationId: PIPO_OPTION,
    });

    const other = substitutionService(pipoAnswer().replace('"Bareboat"', '"Crewed"'));
    const error = await providerRejection(other.service.createOption(pipoDraft));
    expect(error.message).toMatch(/productName Bareboat became Crewed/);
  });

  it("still refuses where the release fails, so the option can only lapse", async () => {
    const { calls, service } = substitutionService(pipoAnswer(), { deleteFails: true });

    const error = await providerRejection(
      service.createOption({ ...pipoDraft, route: { startBaseId: "127", endBaseId: "136" } }),
    );

    expect(error.providerCode).toBe("RESERVATION_SUBSTITUTED");
    expect(error.message).toMatch(/baseToId/);
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
  });
});

type Scripted = { status: number; body: string };

/**
 * A client whose answers are scripted per method, in call order, so a lifecycle that makes
 * several calls can be driven one step at a time. A method asked more often than scripted
 * answers with its last entry.
 */
function scriptedService(
  script: Partial<Record<string, Scripted[]>>,
  overrides: Partial<Parameters<typeof createBookingManagerBookingService>[0]> = {},
) {
  const calls: { method: string; url: string; body: string | undefined }[] = [];
  const served = new Map<string, number>();
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: (url, init) => {
      const method = init.method ?? "GET";
      calls.push({
        method,
        url: String(url),
        body: init.body === undefined ? undefined : String(init.body),
      });
      const answers = script[method] ?? [];
      const index = served.get(method) ?? 0;
      served.set(method, index + 1);
      const answer = answers[Math.min(index, answers.length - 1)];
      if (!answer) return Promise.reject(new Error(`no ${method} scripted`));
      return Promise.resolve({ status: answer.status, text: () => Promise.resolve(answer.body) });
    },
  });
  const service = createBookingManagerBookingService({
    client,
    resolver: fakeResolver(),
    config,
    db: fakeDb(),
    verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }),
    recordEvent: () => Promise.resolve(),
    ...overrides,
  });
  return { calls, service };
}

/*
 * Status 3 is "Option expired", and it keeps the week out of `/offers` until the record is
 * deleted: option 8192658760000107113 on company 225 lapsed on 2026-09-01 and still blocked
 * 31.10.2026 three weeks later.
 */
describe("cancelOption on an expired option", () => {
  const expired = `{"id":${CHARTER_ID},"status":3,"yachtId":978990780000100225,"expirationDate":"2026-09-01 11:59:00"}`;
  const ref = { providerReservationId: CHARTER_ID };

  it("deletes it, since expiry alone does not free the week", async () => {
    const { calls, service } = scriptedService({
      GET: [{ status: 200, body: expired }],
      DELETE: [{ status: 200, body: `{"id":${AGENCY_ID},"status":5}` }],
    });

    await expect(service.cancelOption(ref)).resolves.toMatchObject({ status: "cancelled" });
    expect(calls.map((call) => call.method)).toEqual(["GET", "DELETE"]);
  });

  it("reports a refused delete as a release that did not land", async () => {
    const { service } = scriptedService({
      GET: [{ status: 200, body: expired }],
      DELETE: [{ status: 400, body: "Reservation cannot be cancelled." }],
    });

    const error = await providerRejection(service.cancelOption(ref));

    expect(error).toBeInstanceOf(ContractError);
    expect(error.providerCode).toBe("EXPIRED_OPTION_NOT_RELEASED");
    expect(error.retryable).toBe(false);
  });

  it("leaves a vendor that did not answer to be asked again", async () => {
    const { service } = scriptedService({
      GET: [{ status: 200, body: expired }],
      DELETE: [{ status: 503, body: "down" }],
    });

    const error = await providerRejection(service.cancelOption(ref));

    expect(error.retryable).toBe(true);
  });
});

/*
 * POST /reservation's plain-text 400s on company 225, 2026-09-22. Each says the charter cannot
 * be opened, and which reason decides whether the week may come off the card for everyone.
 */
describe("createOption refusals", () => {
  const refusing = (text: string, productName?: string) =>
    scriptedService(
      { POST: [{ status: 400, body: text }] },
      { loadProductName: () => Promise.resolve(productName) },
    ).service.createOption(draft);

  it("reads our own option on the slot as ours, not as the week sold", async () => {
    const error = await providerRejection(
      refusing("Yacht is not available, own Option exists.", "Bareboat"),
    );

    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(error.providerCode).toBe(OWN_OPTION_HELD);
    expect(refusesOnlyTheTerms(error)).toBe(true);
  });

  it("reads no price for the product we named as a refusal of the product", async () => {
    const error = await providerRejection(
      refusing("Yacht is not available, price not defined.", "Crewed"),
    );

    expect(error.providerCode).toBe(PRODUCT_NOT_OFFERED);
    expect(refusesOnlyTheTerms(error)).toBe(true);
  });

  it("reads no price with no product named as the charter not on sale", async () => {
    const error = await providerRejection(refusing("Yacht is not available, price not defined."));

    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(refusesOnlyTheTerms(error)).toBe(false);
  });

  it("reads any other unavailability as the slot taken", async () => {
    const error = await providerRejection(refusing("Yacht is not available.", "Bareboat"));

    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(error.providerCode).toBe("NOT_AVAILABLE");
    expect(refusesOnlyTheTerms(error)).toBe(false);
  });
});

/*
 * Option #1 of the 225 lifecycle run, 22 September 2026, as POST /reservation answered it (bank
 * details dropped, the crew-list token redacted). Pipo, 17-24.10.2026, base 127.
 */
const OPTION_ANSWER = readFileSync(
  new URL("./fixtures/reservation-225-option.json", import.meta.url),
  "utf8",
);
const pipoOptionDraft: BookingDraft = {
  ...draft,
  checkIn: "2026-10-17",
  checkOut: "2026-10-24",
  guests: 2,
  currency: "EUR",
  route: { startBaseId: "127", endBaseId: "127" },
};
const pipoResolver = {
  ...fakeResolver(),
  toExternalListing: () =>
    Promise.resolve({
      externalYachtId: "207160073500225",
      externalCompanyId: "225",
      externalBaseId: "127",
      listingSourceId: "lsrc_pipo",
    }),
};

describe("createOption keeps what the option says", () => {
  const holding = (answer: string) =>
    scriptedService(
      { POST: [{ status: 201, body: answer }], DELETE: [{ status: 200, body: '{"status":5}' }] },
      {
        resolver: pipoResolver,
        loadProductName: () => Promise.resolve("Bareboat"),
        verifyPrice: () =>
          Promise.resolve({
            hash: PRICE_HASH,
            clientPrice: { amountMinor: 170_000, currency: "EUR" },
          }),
      },
    );

  it("carries the operator's crew-list page", async () => {
    const reservation = await holding(OPTION_ANSWER).service.createOption(pipoOptionDraft);

    expect(reservation.crewListLink).toMatch(
      /^https:\/\/www\.booking-manager\.com\/cbm\/servlet\/cbm\?.*reservation_id=8295147330000100225$/,
    );
  });

  it("drops a crew-list link that is not a web address", async () => {
    const reservation = await holding(
      OPTION_ANSWER.replace(/"crewListLink":\s*"[^"]*"/, '"crewListLink":"javascript:alert(1)"'),
    ).service.createOption(pipoOptionDraft);

    expect(reservation.crewListLink).toBeUndefined();
  });

  it("records what we owe the operator and when, off the charter-side record", async () => {
    const reservation = await holding(OPTION_ANSWER).service.createOption(pipoOptionDraft);

    expect(reservation.operatorSettlement).toEqual({
      currency: "EUR",
      netMinor: 144_500,
      plan: [{ dueDate: "2026-09-29", amountMinor: 144_500 }],
      terms: "50% after booking\n50% 4 weeks before commencement of the charter",
    });
  });

  it("releases and refuses a second option queued behind a hold (status 9)", async () => {
    const { calls, service } = holding(OPTION_ANSWER.replace(/"status":\s*2/, '"status":9'));

    const error = await providerRejection(service.createOption(pipoOptionDraft));

    expect(error.providerCode).toBe("NOT_AN_OPTION");
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
  });

  it("refuses anything but an open option without trying to release it", async () => {
    const { calls, service } = holding(OPTION_ANSWER.replace(/"status":\s*2/, '"status":1'));

    const error = await providerRejection(service.createOption(pipoOptionDraft));

    expect(error.providerCode).toBe("NOT_AN_OPTION");
    expect(calls.map((call) => call.method)).toEqual(["POST"]);
  });
});

/* The agency twin of that option, as GET /reservation/8295147120000107113 answered it. */
describe("operatorSettlementOf", () => {
  it("reads nothing off the agency twin, whose finalPrice is the client's", () => {
    const twin = restReservationSchema.parse(
      parseExactJson(
        `{"id":8295147120000107113,"charterReservationId":8295147330000100225,"status":2,` +
          `"currency":"EUR","termsOfPayment":"  ","commission":0.0,"finalPrice":1700.0,` +
          `"clientPrice":1700.0,"paymentPlan":[{"date":"2026-09-29 00:00:00","amount":1700.0}]}`,
      ),
    );

    expect(operatorSettlementOf(twin)).toBeUndefined();
  });
});

describe("confirmBooking keeps what the answer says", () => {
  it("records the agency twin's id and the crew-list page", async () => {
    const reservation = await serviceAnswering(
      `{"id":${AGENCY_ID},"charterReservationId":${CHARTER_ID},"status":1,` +
        `"crewListLink":"https://www.booking-manager.com/cbm/servlet/cbm?fview=crew_editor&reservation_id=${CHARTER_ID}"}`,
    ).confirmBooking(draft);

    expect(reservation.providerAgencyReservationId).toBe(AGENCY_ID);
    expect(reservation.crewListLink).toContain(`reservation_id=${CHARTER_ID}`);
  });
});

/**
 * A client answering by method and path, for a lifecycle that reads several records. `answer`
 * gets the call number per method, so a second POST can answer differently from the first.
 */
function routedService(
  answer: (method: string, path: string, nth: number) => Scripted,
  overrides: Partial<Parameters<typeof createBookingManagerBookingService>[0]> = {},
) {
  const calls: { method: string; path: string }[] = [];
  const counts = new Map<string, number>();
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    fetchImpl: (url, init) => {
      const method = init.method ?? "GET";
      const path = String(url).slice(config.baseUrl.length + 1);
      calls.push({ method, path });
      const nth = (counts.get(method) ?? 0) + 1;
      counts.set(method, nth);
      const { status, body } = answer(method, path, nth);
      return Promise.resolve({ status, text: () => Promise.resolve(body) });
    },
  });
  const service = createBookingManagerBookingService({
    client,
    resolver: pipoResolver,
    config,
    db: fakeDb(),
    verifyPrice: () =>
      Promise.resolve({ hash: PRICE_HASH, clientPrice: { amountMinor: 170_000, currency: "EUR" } }),
    recordEvent: () => Promise.resolve(),
    loadProductName: () => Promise.resolve("Bareboat"),
    bookingHolding: () => Promise.resolve(undefined),
    ...overrides,
  });
  return { calls, service };
}

/*
 * The 225 lifecycle run: option #1 on Pipo, charter side 8295147330000100225, agency twin
 * 8295147120000107113, which `showOptions` named as `myReservationId`.
 */
const PIPO_CHARTER = "8295147330000100225";
const PIPO_AGENCY = "8295147120000107113";
const PIPO_SHOW_OPTIONS =
  `[{"yachtId":207160073500225,"startBaseId":127,"endBaseId":127,"dateFrom":"2026-10-17 17:00:00",` +
  `"dateTo":"2026-10-24 09:00:00","status":2,"product":"Bareboat","price":1700.0,"currency":"EUR",` +
  `"myReservationId":${PIPO_AGENCY}}]`;
const PIPO_TWIN = `{"id":${PIPO_AGENCY},"charterReservationId":${PIPO_CHARTER},"status":2,"yachtId":207160073500225}`;
const auditDraft: BookingDraft = {
  ...pipoOptionDraft,
  customer: { name: "Test Norinohi", surname: "Audit", email: "audit@example.com" },
};

function pipoVendor(post: (nth: number) => Scripted) {
  return (method: string, path: string, nth: number): Scripted => {
    if (method === "POST") return post(nth);
    if (method === "DELETE") return { status: 200, body: `{"id":${PIPO_AGENCY},"status":5}` };
    if (path.startsWith("offers?")) return { status: 200, body: PIPO_SHOW_OPTIONS };
    if (path === `reservation/${PIPO_AGENCY}`) return { status: 200, body: PIPO_TWIN };
    if (path === `reservation/${PIPO_CHARTER}`) return { status: 200, body: OPTION_ANSWER };
    return { status: 404, body: "" };
  };
}

describe("createOption after a create that did not answer", () => {
  it("takes over the option the lost create opened for this customer", async () => {
    const { calls, service } = routedService(
      pipoVendor(() => ({ status: 504, body: "<html>Gateway Time-out</html>" })),
    );

    const reservation = await service.createOption(auditDraft);

    expect(reservation).toMatchObject({
      status: "option_held",
      providerReservationId: PIPO_CHARTER,
      providerAgencyReservationId: PIPO_AGENCY,
    });
    expect(calls.map((call) => `${call.method} ${call.path.split("?")[0]}`)).toEqual([
      "POST reservation",
      "GET offers",
      `GET reservation/${PIPO_AGENCY}`,
      `GET reservation/${PIPO_CHARTER}`,
    ]);
    expect(calls[1]?.path).toContain("showOptions=true");
  });

  it("releases an orphan held for someone else and opens the option afresh", async () => {
    const { calls, service } = routedService(
      pipoVendor((nth) =>
        nth === 1 ? { status: 504, body: "" } : { status: 201, body: OPTION_ANSWER },
      ),
    );

    await service.createOption({
      ...auditDraft,
      customer: { name: "Ana", surname: "Horvat", email: "a@example.com" },
    });

    expect(calls.map((call) => call.method)).toEqual([
      "POST",
      "GET",
      "GET",
      "GET",
      "DELETE",
      "POST",
    ]);
    expect(calls[4]?.path).toBe(`reservation/${PIPO_CHARTER}`);
  });

  it("refuses the slot where a live booking of ours holds the option", async () => {
    const { calls, service } = routedService(
      pipoVendor(() => ({ status: 400, body: "Yacht is not available, own Option exists." })),
      {
        bookingHolding: (ids) =>
          Promise.resolve(ids.includes(PIPO_CHARTER) ? "bkg_other" : undefined),
      },
    );

    const error = await providerRejection(service.createOption(auditDraft));

    expect(error.providerCode).toBe(OWN_OPTION_HELD);
    expect(error.message).toContain("bkg_other");
    expect(calls.map((call) => call.method)).not.toContain("DELETE");
  });

  it("keeps the timeout where no option of ours is on the slot", async () => {
    const { service } = routedService((method, path) =>
      method === "POST"
        ? { status: 504, body: "" }
        : path.startsWith("offers?")
          ? { status: 200, body: "[]" }
          : { status: 200, body: "[]" },
    );

    const error = await providerRejection(service.createOption(auditDraft));

    expect(error).toBeInstanceOf(TransientError);
  });

  it("keeps the timeout where the lookup cannot be made", async () => {
    const { service } = routedService((method) =>
      method === "POST" ? { status: 504, body: "" } : { status: 503, body: "down" },
    );

    const error = await providerRejection(service.createOption(auditDraft));

    expect(error).toBeInstanceOf(TransientError);
    expect(error.endpoint).toBe("reservation");
  });
});

/*
 * An expired option still blocks its slot, and `showOptions` does not list it: on 225, option
 * 8192658760000107113 (charter 8192659040000100225) on 978990020000100225 for 31.10.2026 read
 * status 3 three weeks after it lapsed, and only `/reservations/2026?month=10` named it.
 */
describe("createOption on a slot our expired option still blocks", () => {
  const LIST = readFileSync(
    new URL("./fixtures/reservations-225-2026-10.json", import.meta.url),
    "utf8",
  );
  const EXPIRED_CHARTER = "8192659040000100225";
  const expiredDraft: BookingDraft = {
    ...auditDraft,
    checkIn: "2026-10-31",
    checkOut: "2026-11-07",
    route: { startBaseId: "194", endBaseId: "194" },
  };
  const resolver = {
    ...fakeResolver(),
    toExternalListing: () =>
      Promise.resolve({
        externalYachtId: "978990020000100225",
        externalCompanyId: "225",
        externalBaseId: "194",
        listingSourceId: "lsrc_expired",
      }),
  };
  const fresh =
    `{"id":8300000000000100225,"status":2,"yachtId":978990020000100225,"dateFrom":"2026-10-31 17:00:00",` +
    `"dateTo":"2026-11-07 09:00:00","expirationDate":"2026-10-01 12:00:00","baseFromId":194,"baseToId":194,` +
    `"productName":"Bareboat","currency":"EUR"}`;

  it("finds it in the month's reservations, deletes it and opens ours", async () => {
    const { calls, service } = routedService(
      (method, path, nth) => {
        if (method === "POST") {
          return nth === 1
            ? { status: 400, body: "Yacht is not available, own Option exists." }
            : { status: 201, body: fresh };
        }
        if (method === "DELETE") return { status: 200, body: '{"status":5}' };
        if (path.startsWith("offers?")) return { status: 200, body: "[]" };
        if (path === "reservations/2026?month=10") return { status: 200, body: LIST };
        if (path === `reservation/${EXPIRED_CHARTER}`) {
          return {
            status: 200,
            body: `{"id":${EXPIRED_CHARTER},"status":3,"yachtId":978990020000100225,"clientName":"Test Norinohi Audit"}`,
          };
        }
        return { status: 404, body: "" };
      },
      { resolver, verifyPrice: () => Promise.resolve({ hash: PRICE_HASH }) },
    );

    const reservation = await service.createOption(expiredDraft);

    expect(reservation.providerReservationId).toBe("8300000000000100225");
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST reservation",
      expect.stringMatching(/^GET offers\?.*showOptions=true/),
      "GET reservations/2026?month=10",
      `GET reservation/${EXPIRED_CHARTER}`,
      `DELETE reservation/${EXPIRED_CHARTER}`,
      "POST reservation",
    ]);
  });
});
