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
  syncTimeoutMs: 1000,
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
    toExternalYachtIds: () => Promise.resolve(new Map<string, string>()),
    toListingId: () => Promise.resolve(LISTING_ID),
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
      // The offer's own handover, not the base's: see `checkInTime` on the quote schema.
      checkInTime: "17:00",
      checkOutTime: "08:00",
    });
    // 3340.00 charter + 150.00 + 70.00 obligatory extras.
    expect(priced.total).toEqual({ amountMinor: 356_000, currency: "EUR" });
    expect(priced.expiresAt).toBe(new Date(FIXED_NOW + 15 * 60 * 1000).toISOString());
  });

  /*
   * Some obligatory extras are priced per head: the tourist tax on yacht 72646441 comes back
   * as 70 units without this field (ten berths across seven nights) and 14 with it set to two.
   * Omitting it billed every couple for a full boat.
   */
  it("tells the vendor how many people the charter is for", async () => {
    const { service, transport } = build();

    await service.getNausysQuote({ ...request, guests: 2 });

    expect(transport.calls[0]?.body).toMatchObject({ numberOfPersons: 2 });
  });

  it("prices two parties separately rather than serving one from the other's answer", async () => {
    const { service, transport } = build({ cacheTtlMs: 60_000 });

    await service.getNausysQuote({ ...request, guests: 2 });
    await service.getNausysQuote({ ...request, guests: 8 });

    expect(transport.calls.map((call) => call.body?.numberOfPersons)).toEqual([2, 8]);
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
      numberOfPersons: 4,
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
     * NauSYS numbers services and equipment independently, so `8003` alone says
     * nothing: an entry keyed on `serviceId` is a service, whatever the customer's
     * code claims. Matching across the two spaces would bill them for whichever
     * one happened to share the number.
     */
    it("does not match an equipment code against a service id", async () => {
      const { service, transport } = build();
      transport.respondWith("freeYachts", fixtureResponse());
      const priced = await service.getNausysQuote(withExtras(["equipment:8003"]));

      expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
    });

    /*
     * The shape the live account actually sends. Its additional extras carry no
     * `serviceId` at all — the id arrives as `extraId`, with `extrasType` naming
     * the space it belongs to. Reading only `serviceId` matched none of them, so
     * every ticked extra was dropped from the quote in silence.
     */
    describe("an offer keyed on extraId", () => {
      const keyedOnExtraId = (extrasType: string) => {
        const body = fixtureResponse();
        for (const extra of firstYacht(body).additionalExtras ?? []) {
          extra.extraId = extra.serviceId;
          extra.extrasType = extrasType;
          delete extra.serviceId;
        }
        return body;
      };

      it("prices a selected SERVICE extra", async () => {
        const { service, transport } = build();
        transport.respondWith("freeYachts", keyedOnExtraId("SERVICE"));
        const priced = await service.getNausysQuote(withExtras(["service:8003"]));

        expect(lineByCode(priced, "service:8003")).toMatchObject({
          group: "optional",
          amount: { amountMinor: 105_000, currency: "EUR" },
        });
        expect(sumOf(priced)).toBe(priced.total.amountMinor);
      });

      it("prices a selected EQUIPMENT extra under its own code", async () => {
        const { service, transport } = build();
        transport.respondWith("freeYachts", keyedOnExtraId("EQUIPMENT"));
        const priced = await service.getNausysQuote(withExtras(["equipment:8003"]));

        expect(lineByCode(priced, "equipment:8003")).toMatchObject({
          group: "optional",
          amount: { amountMinor: 105_000, currency: "EUR" },
        });
        expect(sumOf(priced)).toBe(priced.total.amountMinor);
      });

      it("keeps the two spaces apart", async () => {
        const { service, transport } = build();
        transport.respondWith("freeYachts", keyedOnExtraId("EQUIPMENT"));
        const priced = await service.getNausysQuote(withExtras(["service:8003"]));

        expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
      });

      /*
       * `extrasType` is the only thing that says which space `extraId` counts in.
       * Without it the entry is unplaceable, and pricing it would be a guess at
       * what the customer bought.
       */
      it("prices nothing when the vendor names no id space", async () => {
        const { service, transport } = build();
        const body = keyedOnExtraId("SERVICE");
        for (const extra of firstYacht(body).additionalExtras ?? []) {
          delete extra.extrasType;
        }
        transport.respondWith("freeYachts", body);
        const priced = await service.getNausysQuote(withExtras(["service:8003"]));

        expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
      });

      it("reports both id spaces as offered, priced as the charter would bill them", async () => {
        const { service, transport } = build();
        const body = fixtureResponse();
        const [first, ...rest] = firstYacht(body).additionalExtras ?? [];
        if (!first) throw new Error("fixture lost its additional extras");
        first.extraId = first.serviceId;
        first.extrasType = "EQUIPMENT";
        delete first.serviceId;
        transport.respondWith("freeYachts", body);
        const priced = await service.getNausysQuote(request);

        expect(priced.offeredExtras?.map((item) => item.code)).toEqual([
          "equipment:8003",
          ...rest.map((extra) => `service:${extra.serviceId}`),
        ]);
        /* The figure a ticked box will add, which is what the listing must show:
           the catalogue's own price is a unit against a measure the operator chose. */
        expect(priced.offeredExtras?.[0]?.amount).toEqual({
          amountMinor: 105_000,
          currency: "EUR",
        });
      });

      it("leaves an extra it cannot bill in the charter's currency off the offer", async () => {
        const { service, transport } = build();
        const body = fixtureResponse();
        const [first] = firstYacht(body).additionalExtras ?? [];
        if (!first) throw new Error("fixture lost its additional extras");
        first.currency = "USD";
        transport.respondWith("freeYachts", body);
        const priced = await service.getNausysQuote(request);

        expect(priced.offeredExtras?.map((item) => item.code)).not.toContain("service:8003");
      });

      it("leaves an entry it cannot place out of the offer", async () => {
        const { service, transport } = build();
        const body = keyedOnExtraId("SERVICE");
        for (const extra of firstYacht(body).additionalExtras ?? []) {
          delete extra.extrasType;
        }
        transport.respondWith("freeYachts", body);
        const priced = await service.getNausysQuote(request);

        expect(priced.offeredExtras).toEqual([]);
      });

      it("prices the chosen crew, whose service arrives in the same shape", async () => {
        const { service, transport } = build({
          loadCrewRoles: () => Promise.resolve([{ role: "skipper" as const, externalId: "8003" }]),
        });
        transport.respondWith("freeYachts", keyedOnExtraId("SERVICE"));
        const priced = await service.getNausysQuote({ ...request, crewType: "skipper" });

        expect(lineByCode(priced, "service:8003")).toMatchObject({ group: "crew" });
        expect(sumOf(priced)).toBe(priced.total.amountMinor);
      });
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

  /*
   * An operator marking an obligatory service INCLUDED_IN_PRICE used to reach the `default`
   * arm of `payWhenFor` and throw, which took the listing with it: the adapter's error is an
   * errored offer, no winner, and a CONFLICT on every date the customer could ask about.
   */
  describe("a service the charter price already covers", () => {
    function includedResponse() {
      const body = fixtureResponse();
      const extra = firstObligatoryExtra(body);
      extra.calculationType = "INCLUDED_IN_PRICE";
      return body;
    }

    async function includedQuote(body: FreeYachtsResponse = includedResponse()) {
      const { service, transport } = build();
      transport.respondWith("freeYachts", body);
      return service.getNausysQuote(request);
    }

    it("keeps it as a zero line rather than billing it twice", async () => {
      const priced = await includedQuote();

      expect(lineByCode(priced, "service:8001")).toMatchObject({
        kind: "extra",
        group: "mandatory",
        payWhen: "now",
        amount: { amountMinor: 0, currency: "EUR" },
      });
    });

    it("leaves the total at the charter price plus what is actually charged", async () => {
      const priced = await includedQuote();

      // 3340.00 charter + 70.00 obligatory, with the 150.00 included one costing nothing.
      expect(priced.total).toEqual({ amountMinor: 341_000, currency: "EUR" });
      expect(sumOf(priced)).toBe(priced.total.amountMinor);
    });

    it("prices it at zero in a currency it could never be billed in", async () => {
      const body = includedResponse();
      firstObligatoryExtra(body).currency = "HRK";

      const priced = await includedQuote(body);

      expect(lineByCode(priced, "service:8001").amount).toEqual({
        amountMinor: 0,
        currency: "EUR",
      });
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

  /*
   * Deposit insurance is bought to lower the deposit, and the vendor states the reduced figure
   * beside the ordinary one. Ignoring it charged the customer for the insurance and still held
   * the full deposit against their card at the base.
   */
  describe("deposit insurance", () => {
    const INSURANCE = "service:9001";

    function insuredBody() {
      const body = fixtureResponse();
      const yacht = firstYacht(body);
      yacht.price.depositAmount = "2000.00";
      yacht.price.depositWhenInsuredAmount = "500.00";
      return body;
    }

    it("holds the reduced deposit when the charter carries the insurance", async () => {
      const { service, transport } = build({
        loadDepositInsuranceCodes: () => Promise.resolve(new Set([INSURANCE])),
      });
      transport.respondWith("freeYachts", insuredBody());

      const priced = await service.getNausysQuote({ ...request, extras: [INSURANCE] });

      expect(priced.securityDeposit).toEqual({ amountMinor: 50_000, currency: "EUR" });
    });

    it("holds the ordinary deposit when nobody bought it", async () => {
      const { service, transport } = build({
        loadDepositInsuranceCodes: () => Promise.resolve(new Set([INSURANCE])),
      });
      transport.respondWith("freeYachts", insuredBody());

      const priced = await service.getNausysQuote({ ...request, extras: ["service:52"] });

      expect(priced.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    });

    /*
     * The vendor sends this as a bare 0 on most hulls -- 5,619 of the 7,343 in our own fleet --
     * and read literally it promises the customer that nothing is blocked at the base.
     */
    it("ignores a reduced deposit of zero, which is the vendor's way of saying nothing", async () => {
      const body = insuredBody();
      firstYacht(body).price.depositWhenInsuredAmount = "0.00";

      const { service, transport } = build({
        loadDepositInsuranceCodes: () => Promise.resolve(new Set([INSURANCE])),
      });
      transport.respondWith("freeYachts", body);

      const priced = await service.getNausysQuote({ ...request, extras: [INSURANCE] });

      expect(priced.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    });

    /* 404 hulls publish one that is not lower; holding the customer to it punishes the sale. */
    it("ignores a reduced deposit that is not actually lower", async () => {
      const body = insuredBody();
      firstYacht(body).price.depositWhenInsuredAmount = "2500.00";

      const { service, transport } = build({
        loadDepositInsuranceCodes: () => Promise.resolve(new Set([INSURANCE])),
      });
      transport.respondWith("freeYachts", body);

      const priced = await service.getNausysQuote({ ...request, extras: [INSURANCE] });

      expect(priced.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    });

    /* An operator that publishes no reduced figure holds the same deposit either way. */
    it("holds the ordinary deposit when the operator names no reduced one", async () => {
      const body = insuredBody();
      delete firstYacht(body).price.depositWhenInsuredAmount;

      const { service, transport } = build({
        loadDepositInsuranceCodes: () => Promise.resolve(new Set([INSURANCE])),
      });
      transport.respondWith("freeYachts", body);

      const priced = await service.getNausysQuote({ ...request, extras: [INSURANCE] });

      expect(priced.securityDeposit).toEqual({ amountMinor: 200_000, currency: "EUR" });
    });
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

/*
 * Recorded on yacht 51076474 for 17-24 Oct 2026: the operator sells its transfer as seven rows
 * of service 100511, one per route and vehicle. They are alternatives. Keyed by the service
 * alone, one tick billed all seven, 1,000 EUR at the base for a 60 EUR taxi.
 */
describe("NauSYS extras sold as several variants", () => {
  const transferRow = (id: number, amount: string, text: string) => ({
    id,
    extraId: 100511,
    extrasType: "SERVICE",
    amount,
    totalPrice: amount,
    listPrice: amount,
    quantity: "1.00",
    currency: "EUR",
    priceMeasureId: 101767,
    calculationType: "SEPARATE_PAYMENT",
    condition: { textDE: text, textEN: text },
  });

  function withTransfers() {
    const body = fixtureResponse();
    firstYacht(body).additionalExtras = [
      transferRow(66279570, "60.00", "Athens Airport - Lavrion base; taxi 1 - 3 pax"),
      transferRow(66279573, "120.00", "Athens Airport - Lavrion base; minivan up to 8 pax"),
      transferRow(66279576, "300.00", "Airport - Athens base; bus up to 50 pax"),
      {
        id: 66279577,
        extraId: 109564,
        extrasType: "SERVICE",
        amount: "90.00",
        totalPrice: "90.00",
        quantity: "1.00",
        currency: "EUR",
        calculationType: "SEPARATE_PAYMENT",
        condition: { textEN: "unlimited data" },
      },
    ];
    return body;
  }

  async function priceWith(extras: string[]) {
    const { service, transport } = build({
      loadExtraLabels: async () => new Map([["service:100511", "Transfer"]]),
    });
    transport.respondWith("freeYachts", withTransfers());
    return service.getNausysQuote({ ...request, extras });
  }

  it("offers the transfer once, with each route beneath it", async () => {
    const priced = await priceWith([]);
    const transfer = priced.offeredExtras?.find((item) => item.code === "service:100511");

    expect(transfer?.amount).toEqual({ amountMinor: 6_000, currency: "EUR" });
    expect(transfer?.variants).toEqual([
      {
        code: "service:100511@66279570",
        detail: "Athens Airport - Lavrion base; taxi 1 - 3 pax",
        amount: { amountMinor: 6_000, currency: "EUR" },
        payWhen: "at_check_in",
      },
      {
        code: "service:100511@66279573",
        detail: "Athens Airport - Lavrion base; minivan up to 8 pax",
        amount: { amountMinor: 12_000, currency: "EUR" },
        payWhen: "at_check_in",
      },
      {
        code: "service:100511@66279576",
        detail: "Airport - Athens base; bus up to 50 pax",
        amount: { amountMinor: 30_000, currency: "EUR" },
        payWhen: "at_check_in",
      },
    ]);
  });

  it("leaves an extra the offer lists once without variants", async () => {
    const priced = await priceWith([]);
    const wifi = priced.offeredExtras?.find((item) => item.code === "service:109564");

    expect(wifi).toEqual({
      code: "service:109564",
      amount: { amountMinor: 9_000, currency: "EUR" },
      payWhen: "at_check_in",
      note: "unlimited data",
    });
  });

  it("bills only the route the customer chose, and names it", async () => {
    const priced = await priceWith(["service:100511@66279573"]);
    const optional = priced.lines.filter((line) => line.group === "optional");

    expect(optional).toEqual([
      {
        code: "service:100511@66279573",
        label: "Transfer (Athens Airport - Lavrion base; minivan up to 8 pax)",
        detail: "Athens Airport - Lavrion base; minivan up to 8 pax",
        amount: { amountMinor: 12_000, currency: "EUR" },
        payWhen: "at_check_in",
        kind: "extra",
        group: "optional",
      },
    ]);
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
  });

  it("bills nothing for the transfer's plain code rather than every route at once", async () => {
    const priced = await priceWith(["service:100511"]);

    expect(priced.lines.filter((line) => line.group === "optional")).toEqual([]);
  });

  it("bills two routes the customer chose both of", async () => {
    const priced = await priceWith(["service:100511@66279570", "service:100511@66279576"]);

    expect(
      priced.lines.filter((line) => line.group === "optional").map((line) => line.amount),
    ).toEqual([
      { amountMinor: 6_000, currency: "EUR" },
      { amountMinor: 30_000, currency: "EUR" },
    ]);
  });

  it("still sells a single-row extra by its plain code", async () => {
    const priced = await priceWith(["service:109564"]);

    expect(lineByCode(priced, "service:109564")).toMatchObject({
      label: "Charter extra",
      amount: { amountMinor: 9_000, currency: "EUR" },
    });
    expect(lineByCode(priced, "service:109564")).not.toHaveProperty("detail");
    expect(lineByCode(priced, "service:109564").note).toBe("unlimited data");
  });

  it("re-hashes when the customer switches route at the same price", async () => {
    const body = withTransfers();
    const [first, second] = firstYacht(body).additionalExtras ?? [];
    if (!first || !second) throw new Error("lost the transfer rows");
    second.amount = first.amount;
    second.totalPrice = first.totalPrice;

    const hashOf = async (code: string) => {
      const { service, transport } = build();
      transport.respondWith("freeYachts", structuredClone(body));
      return (await service.getNausysQuote({ ...request, extras: [code] })).priceSourceHash;
    };

    expect(await hashOf("service:100511@66279570")).not.toBe(
      await hashOf("service:100511@66279573"),
    );
  });
});

/*
 * Recorded on the live account: a hostess sold per party size (yacht 40685972) and a skipper
 * sold by the day and by the week (yacht 52042763). Both rows of each used to be billed.
 */
describe("NauSYS crew sold as several variants", () => {
  const crewRow = (
    id: number,
    extraId: number,
    amount: string,
    quantity: string,
    text: string | null,
  ) => ({
    id,
    extraId,
    extrasType: "SERVICE",
    amount,
    quantity,
    totalPrice: (Number(amount) * Number(quantity)).toFixed(2),
    currency: "EUR",
    calculationType: "SEPARATE_PAYMENT",
    ...(text === null ? null : { condition: { textEN: text } }),
  });

  function withCrew() {
    const body = fixtureResponse();
    firstYacht(body).additionalExtras = [
      crewRow(63379865, 2, "190.00", "7.00", "up to 4 guests, payable on the spot in cash"),
      crewRow(63379866, 2, "210.00", "7.00", "5-8 guests, payable on the spot in cash"),
      crewRow(59802921, 1, "200.00", "7.00", "skipper per day"),
      crewRow(59802924, 1, "1500.00", "1.00", null),
    ];
    return body;
  }

  async function pricedWith(
    guests: number,
    crewType: "skipper" | "full-crew" = "full-crew",
    extras: string[] = [],
  ) {
    const { service, transport } = build({
      loadCrewRoles: async () => [
        { role: "skipper", externalId: "1" },
        { role: "hostess", externalId: "2" },
      ],
    });
    transport.respondWith("freeYachts", withCrew());
    const priced = await service.getNausysQuote({ ...request, guests, crewType, extras });
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
    return priced;
  }

  async function crewLines(guests: number, extras: string[] = []) {
    const priced = await pricedWith(guests, "full-crew", extras);
    return priced.lines.filter((line) => line.group === "crew");
  }

  it("prices one skipper, the cheaper of the day and week rates", async () => {
    const skipper = (await crewLines(4)).filter((line) => line.code.startsWith("service:1@"));

    expect(skipper).toHaveLength(1);
    expect(skipper[0]?.amount).toEqual({ amountMinor: 140_000, currency: "EUR" });
    expect(skipper[0]?.detail).toBe("skipper per day");
  });

  it("prices the hostess for the party that is actually sailing", async () => {
    const small = (await crewLines(4)).filter((line) => line.code.startsWith("service:2@"));
    const large = (await crewLines(6)).filter((line) => line.code.startsWith("service:2@"));

    expect(small.map((line) => line.amount.amountMinor)).toEqual([133_000]);
    expect(large.map((line) => line.amount.amountMinor)).toEqual([147_000]);
    expect(large[0]?.detail).toBe("5-8 guests, payable on the spot in cash");
  });

  it("prices the variant the customer picked over the one it would have chosen", async () => {
    const skipper = (await crewLines(4, ["service:1@59802924"])).filter((line) =>
      line.code.startsWith("service:1@"),
    );

    expect(skipper.map((line) => line.amount.amountMinor)).toEqual([150_000]);
  });

  it("never bills a pick for a role no longer aboard as an add-on", async () => {
    const priced = await pricedWith(4, "skipper", ["service:2@63379866"]);

    expect(priced.lines.filter((line) => line.code.startsWith("service:2"))).toEqual([]);
  });

  it("hands the hold the rows it billed, by their season price row ids", async () => {
    const { service, transport } = build({
      loadCrewRoles: async () => [
        { role: "skipper", externalId: "1" },
        { role: "hostess", externalId: "2" },
      ],
    });
    transport.respondWith("freeYachts", withCrew());
    const { billedRows } = await service.getNausysQuoteWithRows({
      ...request,
      guests: 6,
      crewType: "full-crew",
    });

    expect(billedRows).toEqual([
      {
        kind: "service",
        rowId: 63379866,
        code: "service:2@63379866",
        externalId: "2",
        condition: "5-8 guests, payable on the spot in cash",
      },
      {
        kind: "service",
        rowId: 59802921,
        code: "service:1@59802921",
        externalId: "1",
        condition: "skipper per day",
      },
    ]);
  });

  it("falls back to the cheapest when no variant states room for the party", async () => {
    const hostess = (await crewLines(10)).filter((line) => line.code.startsWith("service:2@"));

    expect(hostess.map((line) => line.amount.amountMinor)).toEqual([133_000]);
  });
});

describe("NauSYS variant names", () => {
  it("names a variant by the first line of a long condition, cut short", async () => {
    const paragraph =
      "Professional 'Ghost' skipper ;\nOn board but just as a supportive voice in case is needed.";
    const long = "A".repeat(200);
    const body = fixtureResponse();
    firstYacht(body).additionalExtras = [paragraph, long].map((text, index) => ({
      id: 76975305 + index,
      extraId: 100511,
      extrasType: "SERVICE",
      amount: "100.00",
      totalPrice: "100.00",
      currency: "EUR",
      calculationType: "SEPARATE_PAYMENT",
      condition: { textEN: text },
    }));
    const { service, transport } = build();
    transport.respondWith("freeYachts", body);
    const priced = await service.getNausysQuote(request);
    const details = priced.offeredExtras?.[0]?.variants?.map((variant) => variant.detail);

    expect(details?.[0]).toBe("Professional 'Ghost' skipper ;");
    expect(details?.[1]).toHaveLength(90);
    expect(details?.[1]?.endsWith("…")).toBe(true);
  });
});

/*
 * Recorded on yacht 9155510: a damage waiver obligatory at 420, and the same service offered
 * again as an add-on at 350 "applies only when skipper is chosen". Both were billable.
 */
describe("NauSYS services listed as both obligatory and optional", () => {
  function withWaiverTwice() {
    const body = fixtureResponse();
    const yacht = firstYacht(body);
    yacht.obligatoryExtras = [
      {
        serviceId: 590058,
        amount: "420.00",
        totalPrice: "420.00",
        currency: "EUR",
        calculationType: "SEPARATE_PAYMENT",
        condition: { textEN: "+ 600 EUR refundable deposit" },
      },
    ];
    yacht.additionalExtras = [
      {
        id: 70000001,
        extraId: 590058,
        extrasType: "SERVICE",
        amount: "350.00",
        totalPrice: "350.00",
        currency: "EUR",
        calculationType: "SEPARATE_PAYMENT",
        condition: { textEN: "Applies only when skipper is choosen" },
      },
    ];
    return body;
  }

  async function priceWith(extras: string[], crewType?: "skipper") {
    const { service, transport } = build({
      loadCrewRoles: async () => [{ role: "skipper", externalId: "590058" }],
    });
    transport.respondWith("freeYachts", withWaiverTwice());
    return service.getNausysQuote({ ...request, extras, ...(crewType ? { crewType } : null) });
  }

  it("does not offer the add-on beside the fee", async () => {
    const priced = await priceWith([]);

    expect(priced.offeredExtras?.map((item) => item.code)).not.toContain("service:590058");
  });

  it("bills the obligatory fee once, whatever was ticked", async () => {
    const priced = await priceWith(["service:590058"]);
    const waiver = priced.lines.filter((line) => line.code.startsWith("service:590058"));

    expect(waiver).toHaveLength(1);
    expect(waiver[0]).toMatchObject({
      group: "mandatory",
      amount: { amountMinor: 42_000, currency: "EUR" },
      note: "+ 600 EUR refundable deposit",
    });
  });

  it("does not bill a crew role again when the operator already made it obligatory", async () => {
    const priced = await priceWith([], "skipper");

    expect(priced.lines.filter((line) => line.group === "crew")).toEqual([]);
    expect(sumOf(priced)).toBe(priced.total.amountMinor);
  });
});
