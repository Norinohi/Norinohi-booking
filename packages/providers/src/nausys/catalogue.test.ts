import { describe, expect, it } from "vitest";

import { AuthError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import type { CatalogueSyncEvent, SyncReporter } from "../sync/runner";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import { parseNausysCatalogueCursor, syncNausysCatalogue } from "./catalogue";
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

/** Endpoints with no recorded fixture yet; an empty dump is a valid response. */
const EMPTY_DUMPS: Record<string, unknown> = {
  countrystates: { status: "OK", countryStates: [] },
  sailTypes: { status: "OK", sailTypes: [] },
  steeringTypes: { status: "OK", steeringTypes: [] },
  engineBuilders: { status: "OK", engineBuilders: [] },
  priceMeasures: { status: "OK", priceMeasures: [] },
  seasons: { status: "OK", seasons: [] },
  priceLists: { status: "OK", priceLists: [] },
  discountItems: { status: "OK", discountItems: [] },
};

function build() {
  const transport = new FakeNausysTransport();
  for (const [key, body] of Object.entries(EMPTY_DUMPS)) {
    transport.respondWith(key, body);
  }
  // `yachts/102702` has no fixture of its own and falls back to this key.
  transport.respondWith("yachts", { status: "OK", yachts: [] });

  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });

  const errors: { message: string; resourceType?: string; scopeKey?: string }[] = [];
  const reporter: Pick<SyncReporter, "reportError"> = {
    async reportError(error, scope) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        resourceType: scope?.resourceType,
        scopeKey: scope?.scopeKey,
      });
    },
  };

  return { client, transport, errors, reporter };
}

async function collect(events: AsyncIterable<CatalogueSyncEvent>) {
  const all: CatalogueSyncEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

const entities = (events: CatalogueSyncEvent[]) =>
  events.filter((event) => event.type === "entity");

const completions = (events: CatalogueSyncEvent[]) =>
  events.filter((event) => event.type === "scope-complete");

describe("syncNausysCatalogue", () => {
  it("walks the catalogue in FK order and finishes with the per-company fleets", async () => {
    const { client, transport, reporter } = build();

    const events = await collect(syncNausysCatalogue(client, { reporter }));

    expect(transport.callSequence()).toEqual([
      "countries",
      "countrystates",
      "regions",
      "locations",
      "charterCompanies",
      "charterBases",
      "yachtBuilders",
      "yachtModels",
      "yachtCategories",
      "sailTypes",
      "steeringTypes",
      "engineBuilders",
      "equipmentCategories",
      "equipment",
      "services",
      "priceMeasures",
      "seasons",
      "priceLists",
      "discountItems",
      "yachts-102701",
      "yachts",
    ]);
    // The vendor forbids parallel calls; the per-company sweep is the easiest place
    // to break that by reaching for Promise.all.
    expect(transport.maxConcurrent).toBe(1);
    expect(entities(events).length).toBeGreaterThan(0);
  });

  it("stamps the owning company on every scoped entity", async () => {
    const { client, reporter } = build();

    const events = await collect(syncNausysCatalogue(client, { reporter }));
    const scoped = entities(events).map((event) => event.entity);

    expect(scoped.filter((entity) => entity.resourceType === "yacht")).toEqual([
      expect.objectContaining({ externalId: "4711001", scopeKey: "102701" }),
      expect.objectContaining({ externalId: "4711002", scopeKey: "102701" }),
    ]);
    expect(scoped.find((entity) => entity.externalId === "900201")).toMatchObject({
      resourceType: "base",
      scopeKey: "102702",
    });
    expect(scoped.find((entity) => entity.resourceType === "country")).toMatchObject({
      scopeKey: undefined,
    });
  });

  it("announces one completion per resource type and one per company fleet", async () => {
    const { client, reporter } = build();

    const done = completions(await collect(syncNausysCatalogue(client, { reporter })));

    // No scopeKey on a global dump: one clean call covers every scope of the type.
    expect(done.filter((event) => event.resourceType === "country")).toEqual([
      { type: "scope-complete", resourceType: "country", cursor: { step: 1 } },
    ]);
    expect(done.filter((event) => event.resourceType === "yacht")).toEqual([
      expect.objectContaining({ scopeKey: "102701", cursor: { step: 19, companyIndex: 1 } }),
      expect.objectContaining({ scopeKey: "102702", cursor: { step: 19, companyIndex: 2 } }),
    ]);
  });

  it("skips completed steps when resuming and still finds the companies to sweep", async () => {
    const { client, transport, reporter } = build();

    const events = await collect(
      syncNausysCatalogue(client, { reporter, resume: { step: 19, companyIndex: 1 } }),
    );

    // The companies dump is re-read for its ids only, and yields nothing.
    expect(transport.callSequence()).toEqual(["charterCompanies", "yachts"]);
    expect(entities(events)).toEqual([]);
    expect(completions(events)).toEqual([
      expect.objectContaining({ resourceType: "yacht", scopeKey: "102702" }),
    ]);
  });

  it("uses supplied company ids instead of re-reading the companies dump", async () => {
    const { client, transport, reporter } = build();

    await collect(
      syncNausysCatalogue(client, {
        reporter,
        resume: { step: 19, companyIndex: 0 },
        companyIds: ["102701"],
      }),
    );

    expect(transport.callSequence()).toEqual(["yachts-102701"]);
  });

  it("leaves a failed company fleet unannounced without touching the others", async () => {
    const { client, transport, errors, reporter } = build();
    transport.failWith("yachts-102701", "error-999");

    const events = await collect(syncNausysCatalogue(client, { reporter }));

    // Nothing announces 102701, so the runner cannot sweep that fleet.
    expect(completions(events).filter((event) => event.resourceType === "yacht")).toEqual([
      expect.objectContaining({ scopeKey: "102702" }),
    ]);
    expect(errors).toEqual([
      expect.objectContaining({ resourceType: "yacht", scopeKey: "102701" }),
    ]);
  });

  it("aborts the stream on an authentication failure", async () => {
    const { client, transport, reporter } = build();
    transport.failWith("regions", "error-100");

    await expect(collect(syncNausysCatalogue(client, { reporter }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("refuses to treat an OK response with no collection as an empty dump", async () => {
    const { client, transport, reporter } = build();
    transport.respondWith("countries", { status: "OK" });

    await expect(collect(syncNausysCatalogue(client, { reporter }))).rejects.toThrow(
      /returned no collection/,
    );
  });

  it("reports items without an id and withholds that scope's completion", async () => {
    const { client, transport, errors, reporter } = build();
    transport.respondWith("countries", { status: "OK", countries: [{ code2: "HR" }] });

    const events = await collect(syncNausysCatalogue(client, { reporter }));

    expect(completions(events).some((event) => event.resourceType === "country")).toBe(false);
    expect(errors).toEqual([expect.objectContaining({ resourceType: "country" })]);
  });
});

describe("parseNausysCatalogueCursor", () => {
  it("accepts the shape it writes and rejects anything else", () => {
    expect(parseNausysCatalogueCursor({ step: 19, companyIndex: 4 })).toEqual({
      step: 19,
      companyIndex: 4,
    });
    expect(parseNausysCatalogueCursor({ step: 999 })).toBeNull();
    expect(parseNausysCatalogueCursor("19")).toBeNull();
    expect(parseNausysCatalogueCursor(null)).toBeNull();
  });
});
