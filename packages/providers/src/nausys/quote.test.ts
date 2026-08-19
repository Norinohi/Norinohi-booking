import { describe, expect, it } from "vitest";
import { z } from "zod";

import { unscopedCompanies } from "../shared/company-scope";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { providerQuoteSchema, type ProviderQuote } from "../types";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import { restFreeYachtsResponseSchema } from "./endpoints";
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
  companyScope: unscopedCompanies,
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

/**
 * The adapter's own schema is what types the fixture. It is a loose object, so a
 * test can still bend a field the schema does not name.
 */
type FreeYachtsResponse = z.infer<typeof restFreeYachtsResponseSchema>;

function fixtureResponse(): FreeYachtsResponse {
  return restFreeYachtsResponseSchema.parse(structuredClone(freeYachtsFixture));
}

function firstYacht(body: FreeYachtsResponse) {
  const [yacht] = body.freeYachts ?? [];
  if (!yacht) throw new Error("freeYachts fixture is empty");
  return yacht;
}

function firstObligatoryExtra(body: FreeYachtsResponse) {
  const [extra] = firstYacht(body).obligatoryExtras ?? [];
  if (!extra) throw new Error("fixture lost its obligatory extras");
  return extra;
}

function firstAdditionalExtra(body: FreeYachtsResponse) {
  const [extra] = firstYacht(body).additionalExtras ?? [];
  if (!extra) throw new Error("fixture lost its additional extras");
  return extra;
}

function resolverFor(externalYachtId: string): CatalogueResolver {
  return {
    providerId: () => Promise.resolve("prv_nausys"),
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
    listYachtCompanyScopeKeys: async () => [],
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

  /*
   * `clientPrice` covers the charter and its obligatory extras, so a selected
   * optional extra is genuinely additive. The vendor never learns of the choice —
   * these are settled with the base on arrival.
   */
  describe("selected optional extras", () => {
    const withExtras = (extras: string[]) => ({ ...request, extras });

    it("prices a selected additional extra as an optional line", async () => {
      const { service, transport } = build();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote(withExtras(["service:8003"]));

      expect(lineByCode(priced, "service:8003")).toMatchObject({
        kind: "extra",
        group: "optional",
        payWhen: "at_check_in",
        amount: { amountMinor: 105_000, currency: "EUR" },
      });
      // 3340.00 charter + 150.00 + 70.00 obligatory + 1050.00 selected.
      expect(priced.total).toEqual({ amountMinor: 461_000, currency: "EUR" });
      expect(sumOf(priced)).toBe(priced.total.amountMinor);
    });

    it("prices nothing when the customer selected nothing", async () => {
      const priced = await quote();

      expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
    });

    it("ignores a code the offer does not carry rather than billing it", async () => {
      const { service, transport } = build();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote(withExtras(["service:999999"]));

      expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
    });

    /*
     * NauSYS numbers services and equipment independently, and no recorded offer
     * has ever carried the `extraId` shape, so an `equipment:` code has nothing
     * trustworthy to match against. Matching it on the service id would bill the
     * customer for whatever service happened to share the number.
     */
    it("does not match an equipment code against a service id", async () => {
      const { service, transport } = build();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote(withExtras(["equipment:8003"]));

      expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
    });
  });

  /*
   * NauSYS sells crew as ordinary services and flags none of them, so the roles come
   * from the catalogue sync's reading of the service names. Before this the crew
   * choice was echoed back and priced at nothing: a crewed charter quoted bareboat.
   */
  describe("crew", () => {
    // Service 8003 in the recording, standing in for the skipper the operator sells.
    const crewRoles = [{ role: "skipper" as const, externalId: "8003" }];
    const buildWithCrew = () => build({ loadCrewRoles: () => Promise.resolve(crewRoles) });

    it("prices the chosen crew as a crew line", async () => {
      const { service, transport } = buildWithCrew();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote({ ...request, crewType: "skipper" });

      expect(lineByCode(priced, "service:8003")).toMatchObject({
        kind: "extra",
        group: "crew",
        amount: { amountMinor: 105_000, currency: "EUR" },
      });
      expect(sumOf(priced)).toBe(priced.total.amountMinor);
    });

    it("quotes no crew for a bareboat charter or an unanswered control", async () => {
      const { service, transport } = buildWithCrew();
      transport.respondWith("freeYachts", fixtureResponse());
      const bareboat = await service.getNausysQuote({ ...request, crewType: "bareboat" });
      const unanswered = await service.getNausysQuote(request);

      expect(bareboat.lines.filter((line) => line.group === "crew")).toEqual([]);
      expect(unanswered.lines.filter((line) => line.group === "crew")).toEqual([]);
    });

    it("bills crew once when the same service is also ticked as an extra", async () => {
      const { service, transport } = buildWithCrew();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote({
        ...request,
        crewType: "skipper",
        extras: ["service:8003"],
      });

      expect(priced.lines.filter((line) => line.code === "service:8003")).toHaveLength(1);
      expect(sumOf(priced)).toBe(priced.total.amountMinor);
    });

    /*
     * The operator names its crew in a way the projection did not recognise, so the
     * catalogue holds no role for this listing. Charging for a service we guessed at
     * would be worse than leaving the choice unpriced.
     */
    it("leaves crew unpriced when the catalogue recognised no role", async () => {
      const { service, transport } = build({ loadCrewRoles: () => Promise.resolve([]) });
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote({ ...request, crewType: "full-crew" });

      expect(priced.lines.filter((line) => line.group === "crew")).toEqual([]);
    });
  });

  it("maps ADVANCE_PAYMENT to now and SEPARATE_PAYMENT to at_check_in", async () => {
    const priced = await quote();

    expect(lineByCode(priced, "service:8001")).toMatchObject({
      kind: "extra",
      payWhen: "at_check_in",
      amount: { amountMinor: 15_000, currency: "EUR" },
    });
    // Quantity 10 on a 70.00 service: `amount` is the line total, not a unit price.
    expect(lineByCode(priced, "service:8002")).toMatchObject({
      kind: "extra",
      payWhen: "now",
      amount: { amountMinor: 7_000, currency: "EUR" },
    });
  });

  it("rejects an unknown calculationType rather than guessing when payment is due", async () => {
    const body = fixtureResponse();
    const extra = firstObligatoryExtra(body);
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

  it("multiplies a multi-unit extra the vendor gave no total for", async () => {
    // NauSYS adjudicated their own documentation example (Aug 2026): `amount` is
    // the unit price, `totalPrice` is amount x quantity, and the doc example that
    // shows otherwise is a mistake. This is the case that used to be refused.
    const body = fixtureResponse();
    const extra = firstObligatoryExtra(body);
    extra.amount = "10.00";
    extra.quantity = "10.00";
    delete extra.totalPrice;

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(
      priced.lines.find((item) => item.code === `service:${extra.serviceId}`)?.amount.amountMinor,
    ).toBe(10_000);
  });

  it("prices a single-unit extra with no total from its amount", async () => {
    const body = fixtureResponse();
    const extra = firstObligatoryExtra(body);
    extra.amount = "150.00";
    extra.quantity = "1.00";
    delete extra.totalPrice;

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(
      priced.lines.find((item) => item.code === `service:${extra.serviceId}`)?.amount.amountMinor,
    ).toBe(15_000);
  });

  it("prefers the vendor's own line total over the unit amount", async () => {
    const body = fixtureResponse();
    const extra = firstObligatoryExtra(body);
    extra.amount = "10.00";
    extra.quantity = "3.00";
    extra.totalPrice = "29.99";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);

    expect(
      priced.lines.find((item) => item.code === `service:${extra.serviceId}`)?.amount.amountMinor,
    ).toBe(2_999);
  });

  it("moves when an obligatory extra moves", async () => {
    const body = fixtureResponse();
    const extra = firstObligatoryExtra(body);
    extra.amount = "160.00";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const moved = await service.getNausysQuote(request);

    expect(moved.priceSourceHash).not.toBe((await quote()).priceSourceHash);
  });

  /*
   * Unselected additional extras stay out of the hash: the operator may re-price
   * its whole optional catalogue without touching what this customer owes, and
   * invalidating the quote for that would be noise. Selected ones are a different
   * matter; see below.
   */
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

  it("moves when a selected optional extra moves", async () => {
    const selected = { ...request, extras: ["service:8003"] };
    const baseline = build();
    baseline.transport.respondWith("freeYachts", fixtureResponse());
    const before = await baseline.service.getNausysQuote(selected);

    const body = fixtureResponse();
    const extra = firstAdditionalExtra(body);
    extra.amount = "1200.00";
    extra.totalPrice = "1200.00";

    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const after = await service.getNausysQuote(selected);

    expect(after.priceSourceHash).not.toBe(before.priceSourceHash);
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
