import { describe, expect, it } from "vitest";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { providerQuoteSchema, type ProviderQuote } from "../types";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import freeYachtsFixture from "./fixtures/freeYachts.json" with { type: "json" };
import { createNausysQuoteService, type NausysQuoteServiceOptions } from "./quote";
import { FakeNausysTransport } from "./testing/fake-transport";

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

const LISTING_ID = "ylst_01JQZ0000000000000000000";
const FIXED_NOW = Date.parse("2026-02-10T09:00:00.000Z");

const request = {
  listingId: LISTING_ID,
  checkIn: "2026-07-04",
  checkOut: "2026-07-11",
  guests: 4,
};

/** The fixture, loose enough to bend: several tests need a field the schema does not name. */
type FreeYachtsResponse = {
  status: string;
  errorCode: number;
  freeYachts: (Record<string, unknown> & {
    yachtId: number;
    status: string;
    price: Record<string, unknown> & {
      priceListPrice: string;
      clientPrice: string;
      discounts: { discountItemId: number; amount: string | number; type: string }[];
    };
    paymentPlans?: { date: string; percentage: number }[];
    obligatoryExtras: (Record<string, unknown> & {
      serviceId: number;
      amount: string;
      currency: string;
      calculationType?: string;
    })[];
  })[];
};

function fixtureResponse(): FreeYachtsResponse {
  return structuredClone(freeYachtsFixture) as unknown as FreeYachtsResponse;
}

function firstYacht(body: FreeYachtsResponse) {
  const [yacht] = body.freeYachts;
  if (!yacht) throw new Error("freeYachts fixture is empty");
  return yacht;
}

function resolverFor(externalYachtId: string): CatalogueResolver {
  return {
    toExternalListing: () =>
      Promise.resolve({
        externalYachtId,
        externalCompanyId: "102701",
        externalBaseId: "511001",
        listingSourceId: "lsrc_1",
      }),
    toListingId: () => Promise.resolve(LISTING_ID),
    toExternalAmenityIds: () => Promise.resolve([]),
    toExternalCountryId: () => Promise.resolve(null),
    loadListingSummary: () => Promise.resolve(null),
    listExternalCompanyIds: () => Promise.resolve([]),
  };
}

type BuildOptions = Partial<Omit<NausysQuoteServiceOptions, "client" | "resolver" | "config">> & {
  externalYachtId?: string;
};

function build(options: BuildOptions = {}) {
  const { externalYachtId = "4711001", ...serviceOptions } = options;
  const transport = new FakeNausysTransport();
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });

  const service = createNausysQuoteService({
    client,
    resolver: resolverFor(externalYachtId),
    config,
    now: () => FIXED_NOW,
    ...serviceOptions,
  });

  return { service, transport };
}

function quote(options: BuildOptions = {}): Promise<ProviderQuote> {
  return build(options).service.getNausysQuote(request);
}

function lineByCode(priced: ProviderQuote, code: string) {
  const line = priced.lines.find((item) => item.code === code);
  if (!line) throw new Error(`No quote line with code ${code}`);
  return line;
}

const sumOf = (priced: ProviderQuote) =>
  priced.lines.reduce((total, line) => total + line.amount.amountMinor, 0);

describe("NauSYS live quote", () => {
  it("prices the fixture period against the canonical DTO", async () => {
    const priced = await quote();

    expect(() => providerQuoteSchema.parse(priced)).not.toThrow();
    expect(priced).toMatchObject({
      provider: "nausys",
      listingId: LISTING_ID,
      providerSourceId: "nausys:4711001",
      checkIn: "2026-07-04",
      checkOut: "2026-07-11",
      guests: 4,
      currency: "EUR",
      repriced: false,
    });
    // 3340.00 charter + 150.00 + 70.00 obligatory extras.
    expect(priced.total).toEqual({ amountMinor: 356_000, currency: "EUR" });
    expect(priced.expiresAt).toBe(new Date(FIXED_NOW + 15 * 60 * 1000).toISOString());
  });

  it("sends the nested-credential freeYachts request the vendor documents", async () => {
    const { service, transport } = build();
    await service.getNausysQuote(request);

    expect(transport.callSequence()).toEqual(["freeYachts"]);
    expect(transport.lastBody("freeYachts")).toEqual({
      credentials: { username: "agency-user", password: "hunter2" },
      periodFrom: "04.07.2026",
      periodTo: "11.07.2026",
      yachts: [4711001],
      currency: "EUR",
      extendedDataSet: "PAYMENT_PLAN,ADDITIONAL_EXTRAS",
    });
  });

  it("marks exactly one base line and the lines sum to the total", async () => {
    const priced = await quote();

    expect(priced.lines.filter((line) => line.kind === "base")).toHaveLength(1);
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
  });

  it("maps ADVANCE_PAYMENT to now and SEPARATE_PAYMENT to at_check_in", async () => {
    const priced = await quote();

    expect(lineByCode(priced, "nausys-service-8001")).toMatchObject({
      kind: "extra",
      payWhen: "at_check_in",
      amount: { amountMinor: 15_000, currency: "EUR" },
    });
    // Quantity 10 on a 70.00 service: `amount` is the line total, not a unit price.
    expect(lineByCode(priced, "nausys-service-8002")).toMatchObject({
      kind: "extra",
      payWhen: "now",
      amount: { amountMinor: 7_000, currency: "EUR" },
    });
  });

  it("rejects an unknown calculationType rather than guessing when payment is due", async () => {
    const body = fixtureResponse();
    const [extra] = firstYacht(body).obligatoryExtras;
    if (!extra) throw new Error("fixture lost its obligatory extras");
    extra.calculationType = "ON_INVOICE";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);

    await expect(service.getNausysQuote(request)).rejects.toBeInstanceOf(ContractError);
  });

  it("turns provider discounts into negative lines that reconcile to clientPrice", async () => {
    const priced = await quote();

    const discounts = priced.lines.filter((line) => line.kind === "discount");
    expect(discounts.map((line) => line.amount.amountMinor)).toEqual([-39_000, -17_000]);
    expect(lineByCode(priced, "base-charter").amount.amountMinor).toBe(390_000);
    // 3900.00 list - 10% - 170.00 = the 3340.00 clientPrice NauSYS bills against.
    expect(390_000 + discounts.reduce((sum, line) => sum + line.amount.amountMinor, 0)).toBe(
      334_000,
    );
  });

  it("falls back to clientPrice when the discounts do not explain the list price", async () => {
    const body = fixtureResponse();
    firstYacht(body).price.clientPrice = "3300.00";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(priced.lines.filter((line) => line.kind === "discount")).toHaveLength(0);
    expect(lineByCode(priced, "base-charter").amount.amountMinor).toBe(330_000);
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
    expect(priced.total.amountMinor).toBe(352_000);
  });

  it("derives the deposit policy from the vendor payment plans", async () => {
    const priced = await quote();

    expect(priced.paymentPolicy).toEqual({
      mode: "deposit",
      depositPct: 0.5,
      balanceDueAt: "2026-06-04",
    });
    // 50% of what is payable now: 3900.00 - 560.00 discounts + 70.00 advance extra.
    expect(priced.deposit).toEqual({ amountMinor: 170_500, currency: "EUR" });
  });

  it("charges in full when the vendor returns no payment plan", async () => {
    const body = fixtureResponse();
    delete firstYacht(body).paymentPlans;

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(priced.paymentPolicy).toEqual({ mode: "full", depositPct: 1 });
    expect(priced.deposit).toEqual({ amountMinor: 341_000, currency: "EUR" });
  });

  it("keeps the security deposit out of the total", async () => {
    const priced = await quote({
      loadSecurityDeposit: () => Promise.resolve({ amountMinor: 200_000, currency: "EUR" }),
    });

    expect(priced.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    expect(priced.total.amountMinor).toBe(356_000);
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
  });

  it("never lets agencyPrice reach the quote", async () => {
    const body = fixtureResponse();
    const yacht = firstYacht(body);
    yacht.agencyPrice = "2999.99";
    yacht.price.agencyPrice = "2999.99";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    const serialized = JSON.stringify(priced);
    expect(serialized).not.toContain("agencyPrice");
    expect(serialized).not.toContain("2999.99");
    expect(serialized).not.toContain("299999");
    expect(priced.lines.some((line) => line.amount.amountMinor === 299_999)).toBe(false);
  });

  it("treats UNDER_OPTION as unavailable", async () => {
    const { service } = build({ externalYachtId: "4711002" });

    await expect(service.getNausysQuote(request)).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("treats an empty freeYachts array as unavailable", async () => {
    const { service, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", errorCode: 0, freeYachts: [] });

    await expect(service.getNausysQuote(request)).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("rejects a period the vendor did not price", async () => {
    const body = fixtureResponse();
    firstYacht(body).periodTo = "18.07.2026";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);

    await expect(service.getNausysQuote(request)).rejects.toBeInstanceOf(ContractError);
  });
});

describe("NauSYS priceSourceHash", () => {
  it("is stable across two identical vendor responses", async () => {
    const [first, second] = await Promise.all([quote(), quote()]);

    expect(first.priceSourceHash).toBe(second.priceSourceHash);
    expect(first.id).toBe(second.id);
  });

  it("moves when clientPrice moves", async () => {
    const body = fixtureResponse();
    firstYacht(body).price.clientPrice = "3350.00";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const moved = await service.getNausysQuote(request);

    expect(moved.priceSourceHash).not.toBe((await quote()).priceSourceHash);
  });

  it("refuses to price a multi-unit extra the vendor gave no total for", async () => {
    // The vendor says `amount` is a unit price; their own documentation example
    // adds a quantity-10 extra at one times `amount`. Rather than pick a side and
    // silently over or under bill, an ambiguous line fails.
    const body = fixtureResponse();
    const [extra] = firstYacht(body).obligatoryExtras;
    if (!extra) throw new Error("fixture lost its obligatory extras");
    extra.quantity = "10.00";
    delete extra.totalPrice;

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);

    await expect(service.getNausysQuote(request)).rejects.toThrow(/ambiguous/);
  });

  it("prices a single-unit extra with no total from its amount", async () => {
    const body = fixtureResponse();
    const [extra] = firstYacht(body).obligatoryExtras;
    if (!extra) throw new Error("fixture lost its obligatory extras");
    extra.amount = "150.00";
    extra.quantity = "1.00";
    delete extra.totalPrice;

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(
      priced.lines.find((item) => item.code === `nausys-service-${extra.serviceId}`)?.amount
        .amountMinor,
    ).toBe(15_000);
  });

  it("prefers the vendor's own line total over the unit amount", async () => {
    const body = fixtureResponse();
    const [extra] = firstYacht(body).obligatoryExtras;
    if (!extra) throw new Error("fixture lost its obligatory extras");
    extra.amount = "10.00";
    extra.quantity = "3.00";
    extra.totalPrice = "29.99";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(
      priced.lines.find((item) => item.code === `nausys-service-${extra.serviceId}`)?.amount
        .amountMinor,
    ).toBe(2_999);
  });

  it("moves when an obligatory extra moves", async () => {
    const body = fixtureResponse();
    const [extra] = firstYacht(body).obligatoryExtras;
    if (!extra) throw new Error("fixture lost its obligatory extras");
    extra.amount = "160.00";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const moved = await service.getNausysQuote(request);

    expect(moved.priceSourceHash).not.toBe((await quote()).priceSourceHash);
  });

  it("ignores fields that cannot change what the customer pays", async () => {
    const body = fixtureResponse();
    const yacht = firstYacht(body);
    yacht.requestId = "echo-4711001";
    yacht.additionalExtras = [];

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const echoed = await service.getNausysQuote(request);

    expect(echoed.priceSourceHash).toBe((await quote()).priceSourceHash);
  });
});

describe("NauSYS quote cache", () => {
  it("calls the vendor on every quote by default", async () => {
    const { service, transport } = build();

    await service.getNausysQuote(request);
    await service.getNausysQuote(request);

    expect(transport.callCount("freeYachts")).toBe(2);
  });

  it("shares one observation per yacht and period while the TTL holds", async () => {
    const { service, transport } = build({ cacheTtlMs: 60_000 });

    const first = await service.getNausysQuote(request);
    const second = await service.getNausysQuote(request);

    expect(transport.callCount("freeYachts")).toBe(1);
    expect(second.priceSourceHash).toBe(first.priceSourceHash);
  });
});
