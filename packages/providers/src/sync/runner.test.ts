import { describe, expect, it, vi } from "vitest";

// runner.ts reads the server env for the auto-publish bootstrap list, and that
// module validates at import time. Hoisted so it lands before the import runs.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { JsonValue } from "../shared/json";
import { AuthError, TransientError } from "../shared/errors";
import { stableSourceHash } from "../shared/raw-retention";
import type { ProviderResourceType, RawEntity } from "../types";
import {
  type CatalogueSyncEvent,
  type CatalogueSyncSource,
  type CatalogueSyncStore,
  fromRawEntities,
  runCatalogueIngest,
} from "./runner";

interface StoredRecord {
  id: string;
  resourceType: ProviderResourceType;
  externalId: string;
  scopeKey?: string;
  sourceHash: string;
  active: boolean;
  lastSeenAt: Date | null;
  rawPayloadWrites: number;
}

/**
 * Stands in for the Drizzle store. The rules worth protecting live in the ingest
 * loop, not in the SQL: what gets restamped, what gets a new raw payload, and above
 * all which scopes a sweep is allowed to touch.
 */
function fakeStore(seed: Partial<StoredRecord>[] = []) {
  const records = new Map<string, StoredRecord>();
  const errors: { errorType: string; message: string }[] = [];
  const cursors: unknown[] = [];
  const closed: { status: string; counts: Record<string, number> }[] = [];
  let started: Date | null = null;
  let nextId = 1;
  /* Round trips, which is the whole point of batching them. */
  let findCalls = 0;
  let touchCalls = 0;
  /* The external ids handed to each writeRecords call, one entry per statement. */
  const writeCalls: string[][] = [];
  /* External id → the failure the store answers a batch containing it with. */
  const writeRejections = new Map<string, Error>();

  const keyOf = (resourceType: ProviderResourceType, externalId: string) =>
    `${resourceType}::${externalId}`;

  for (const item of seed) {
    const record: StoredRecord = {
      id: `prec_${nextId++}`,
      resourceType: item.resourceType ?? "yacht",
      externalId: item.externalId ?? "0",
      scopeKey: item.scopeKey,
      sourceHash: item.sourceHash ?? "seed",
      active: item.active ?? true,
      lastSeenAt: item.lastSeenAt ?? null,
      rawPayloadWrites: 0,
    };
    records.set(keyOf(record.resourceType, record.externalId), record);
  }

  const store: CatalogueSyncStore = {
    syncRunId: "sync_test",
    async startRun(startedAt) {
      started = startedAt;
    },
    async findRecords(resourceType, externalIds) {
      findCalls += 1;
      const found = new Map<string, { id: string; sourceHash: string | null }>();
      for (const externalId of externalIds) {
        const record = records.get(keyOf(resourceType, externalId));
        if (record) found.set(externalId, { id: record.id, sourceHash: record.sourceHash });
      }
      return found;
    },
    async writeRecords(inputs) {
      writeCalls.push(inputs.map((input) => input.externalId));

      // All or nothing, like the real store: a batch that throws leaves the
      // database exactly as it found it, which is what the caller's fallback
      // assumes when it re-runs the same inputs one at a time.
      for (const input of inputs) {
        const rejection = writeRejections.get(input.externalId);
        if (rejection) throw rejection;
      }

      for (const input of inputs) {
        const key = keyOf(input.resourceType, input.externalId);
        const existing = records.get(key);
        records.set(key, {
          id: existing?.id ?? `prec_${nextId++}`,
          resourceType: input.resourceType,
          externalId: input.externalId,
          scopeKey: input.scopeKey,
          sourceHash: input.sourceHash,
          active: true,
          lastSeenAt: input.seenAt,
          rawPayloadWrites: (existing?.rawPayloadWrites ?? 0) + 1,
        });
      }
    },
    async touchRecords(recordIds, seenAt) {
      touchCalls += 1;
      const wanted = new Set(recordIds);
      for (const record of records.values()) {
        if (!wanted.has(record.id)) continue;
        record.active = true;
        record.lastSeenAt = seenAt;
      }
    },
    async sweepScope(input) {
      let swept = 0;
      for (const record of records.values()) {
        if (record.resourceType !== input.resourceType) continue;
        if (input.scopeKey !== undefined && record.scopeKey !== input.scopeKey) continue;
        if (!record.active) continue;
        if (record.lastSeenAt !== null && record.lastSeenAt >= input.seenBefore) continue;
        record.active = false;
        swept += 1;
      }
      return swept;
    },
    async recordError(input) {
      errors.push({ errorType: input.errorType, message: input.message });
    },
    async saveCursor(cursor) {
      cursors.push(cursor);
    },
    async closeRun(input) {
      closed.push({
        status: input.status,
        counts: {
          created: input.createdCount,
          updated: input.updatedCount,
          skipped: input.skippedCount,
          failed: input.failedCount,
        },
      });
    },
  };

  return {
    store,
    errors,
    cursors,
    closed,
    records,
    startedAt: () => started,
    roundTrips: () => ({ find: findCalls, touch: touchCalls, write: writeCalls.length }),
    writeBatches: () => writeCalls,
    /** Makes any batch carrying this external id throw, the way one bad row does. */
    rejectWrite: (externalId: string, error: Error) => writeRejections.set(externalId, error),
    record: (resourceType: ProviderResourceType, externalId: string) =>
      records.get(keyOf(resourceType, externalId)),
  };
}

const entity = (
  resourceType: ProviderResourceType,
  externalId: string,
  payload: JsonValue,
  scopeKey?: string,
): RawEntity => ({ resourceType, externalId, scopeKey, payload });

const streamOf = (events: CatalogueSyncEvent[]): CatalogueSyncSource =>
  async function* source() {
    for (const event of events) yield event;
  };

const yachtPayload = { id: 4711001, name: "Marlin" };

describe("runCatalogueIngest", () => {
  it("creates a record and its raw payload for a new entity", async () => {
    const fake = fakeStore();

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        { type: "entity", entity: entity("yacht", "4711001", yachtPayload, "102701") },
        { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
      ]),
    });

    expect(summary).toMatchObject({ status: "success", createdCount: 1, skippedCount: 0 });
    expect(fake.record("yacht", "4711001")?.rawPayloadWrites).toBe(1);
  });

  it("restamps an unchanged record without writing a second raw payload", async () => {
    const fake = fakeStore([
      {
        resourceType: "yacht",
        externalId: "4711001",
        scopeKey: "102701",
        sourceHash: stableSourceHash(yachtPayload),
        lastSeenAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        // Key order differs from the stored payload; the hash must not care.
        { type: "entity", entity: entity("yacht", "4711001", { name: "Marlin", id: 4711001 }) },
      ]),
    });

    expect(summary).toMatchObject({ skippedCount: 1, createdCount: 0, updatedCount: 0 });
    expect(fake.record("yacht", "4711001")?.rawPayloadWrites).toBe(0);
    expect(fake.record("yacht", "4711001")?.lastSeenAt).toEqual(fake.startedAt());
  });

  it("reads and restamps a whole batch in one round trip each", async () => {
    const payloads = Array.from({ length: 40 }, (_, index) => ({
      id: index,
      name: `Boat ${index}`,
    }));
    const fake = fakeStore(
      payloads.map((payload) => ({
        resourceType: "yacht" as const,
        externalId: String(payload.id),
        scopeKey: "102701",
        sourceHash: stableSourceHash(payload),
        lastSeenAt: new Date("2026-01-01T00:00:00Z"),
      })),
    );

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        ...payloads.map((payload) => ({
          type: "entity" as const,
          entity: entity("yacht", String(payload.id), payload, "102701"),
        })),
        { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
      ]),
    });

    expect(summary).toMatchObject({ skippedCount: 40, status: "success" });
    // The whole point: 40 unchanged records used to cost 80 sequential queries.
    // No write at all, because none of them changed.
    expect(fake.roundTrips()).toEqual({ find: 1, touch: 1, write: 0 });
  });

  it("restamps the batch before a sweep can read it as absent", async () => {
    // The regression this guards is total: flush after sweep and every record the
    // run just read is deactivated, which hides the entire fleet it imported.
    const payloads = Array.from({ length: 5 }, (_, index) => ({ id: index }));
    const fake = fakeStore(
      payloads.map((payload) => ({
        resourceType: "yacht" as const,
        externalId: String(payload.id),
        scopeKey: "102701",
        sourceHash: stableSourceHash(payload),
        lastSeenAt: new Date("2026-01-01T00:00:00Z"),
      })),
    );

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        ...payloads.map((payload) => ({
          type: "entity" as const,
          entity: entity("yacht", String(payload.id), payload, "102701"),
        })),
        { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
      ]),
    });

    expect(summary.deactivatedCount).toBe(0);
    for (const payload of payloads) {
      expect(fake.record("yacht", String(payload.id))?.active).toBe(true);
    }
  });

  it("flushes before saving a cursor, so a resume cannot skip buffered entities", async () => {
    const fake = fakeStore();

    await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        { type: "entity", entity: entity("yacht", "4711001", yachtPayload, "102701") },
        {
          type: "scope-complete",
          resourceType: "yacht",
          scopeKey: "102701",
          cursor: { step: 1 },
        },
      ]),
    });

    // Written by the time the cursor that would skip past it was saved.
    expect(fake.record("yacht", "4711001")).toBeDefined();
    expect(fake.cursors).toEqual([{ step: 1 }, null]);
  });

  it("keeps the last copy when one dump names a record twice", async () => {
    const fake = fakeStore();

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        { type: "entity", entity: entity("yacht", "4711001", { id: 4711001, name: "Old" }) },
        { type: "entity", entity: entity("yacht", "4711001", { id: 4711001, name: "New" }) },
      ]),
    });

    expect(summary).toMatchObject({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    expect(fake.record("yacht", "4711001")?.rawPayloadWrites).toBe(1);
    expect(fake.record("yacht", "4711001")?.sourceHash).toBe(
      stableSourceHash({ id: 4711001, name: "New" }),
    );
  });

  it("does not confuse two resource types that share an external id", async () => {
    const fake = fakeStore();

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        { type: "entity", entity: entity("yacht", "17", { id: 17, kind: "yacht" }) },
        { type: "entity", entity: entity("base", "17", { id: 17, kind: "base" }) },
      ]),
    });

    expect(summary.createdCount).toBe(2);
    expect(fake.record("yacht", "17")).toBeDefined();
    expect(fake.record("base", "17")).toBeDefined();
    // One read per type, not one per record.
    expect(fake.roundTrips().find).toBe(2);
  });

  it("reactivates a record that reappears in a dump", async () => {
    const fake = fakeStore([
      {
        resourceType: "yacht",
        externalId: "4711001",
        sourceHash: stableSourceHash(yachtPayload),
        active: false,
      },
    ]);

    await runCatalogueIngest({
      store: fake.store,
      source: streamOf([{ type: "entity", entity: entity("yacht", "4711001", yachtPayload) }]),
    });

    expect(fake.record("yacht", "4711001")?.active).toBe(true);
  });

  describe("stamp and sweep", () => {
    it("deactivates records missing from a clean dump of that scope", async () => {
      const fake = fakeStore([
        { resourceType: "yacht", externalId: "gone", scopeKey: "102701" },
        { resourceType: "yacht", externalId: "kept", scopeKey: "102701" },
      ]);

      const summary = await runCatalogueIngest({
        store: fake.store,
        source: streamOf([
          { type: "entity", entity: entity("yacht", "kept", yachtPayload, "102701") },
          { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
        ]),
      });

      expect(summary.deactivatedCount).toBe(1);
      expect(fake.record("yacht", "gone")?.active).toBe(false);
      expect(fake.record("yacht", "kept")?.active).toBe(true);
    });

    it("never sweeps a scope whose fetch failed, and never a neighbour's", async () => {
      const fake = fakeStore([
        { resourceType: "yacht", externalId: "a1", scopeKey: "102701" },
        { resourceType: "yacht", externalId: "b1", scopeKey: "102702" },
      ]);

      const summary = await runCatalogueIngest({
        store: fake.store,
        source: (reporter) =>
          (async function* () {
            await reporter.reportError(new TransientError("fetch failed"), {
              resourceType: "yacht",
              scopeKey: "102701",
            });
            yield { type: "entity", entity: entity("yacht", "b2", yachtPayload, "102702") };
            yield { type: "scope-complete", resourceType: "yacht", scopeKey: "102702" };
          })(),
      });

      expect(summary.status).toBe("partial");
      // 102701 was never announced, so its fleet stays live.
      expect(fake.record("yacht", "a1")?.active).toBe(true);
      expect(fake.record("yacht", "b1")?.active).toBe(false);
    });

    it("blocks a global sweep when any scope of that type failed", async () => {
      const fake = fakeStore([{ resourceType: "base", externalId: "900101", scopeKey: "102701" }]);

      await runCatalogueIngest({
        store: fake.store,
        source: (reporter) =>
          (async function* () {
            await reporter.reportError(new TransientError("one bad row"), {
              resourceType: "base",
              scopeKey: "102701",
            });
            yield { type: "scope-complete", resourceType: "base" };
          })(),
      });

      expect(fake.record("base", "900101")?.active).toBe(true);
    });

    it("sweeps every scope of a resource type when the dump was global and clean", async () => {
      const fake = fakeStore([
        { resourceType: "base", externalId: "900101", scopeKey: "102701" },
        { resourceType: "base", externalId: "900201", scopeKey: "102702" },
      ]);

      const summary = await runCatalogueIngest({
        store: fake.store,
        source: streamOf([{ type: "scope-complete", resourceType: "base" }]),
      });

      expect(summary.deactivatedCount).toBe(2);
    });
  });

  describe("failure handling", () => {
    it("counts a reported failure and finishes partial", async () => {
      const fake = fakeStore();

      const summary = await runCatalogueIngest({
        store: fake.store,
        source: (reporter) =>
          (async function* () {
            await reporter.reportError(new TransientError("timeout"), { resourceType: "yacht" });
            yield { type: "entity", entity: entity("yacht", "4711001", yachtPayload) };
          })(),
      });

      expect(summary).toMatchObject({ status: "partial", failedCount: 1, createdCount: 1 });
      expect(fake.errors).toEqual([{ errorType: "transient", message: "timeout" }]);
    });

    it("aborts on an auth failure and leaves the cursor in place", async () => {
      const fake = fakeStore();

      const summary = await runCatalogueIngest({
        store: fake.store,
        source: () =>
          (async function* () {
            yield {
              type: "scope-complete",
              resourceType: "country",
              cursor: { step: 1 },
            } satisfies CatalogueSyncEvent;
            throw new AuthError("credentials rejected");
          })(),
      });

      expect(summary).toMatchObject({ status: "failed", aborted: true });
      expect(fake.errors).toEqual([{ errorType: "auth", message: "credentials rejected" }]);
      // Only the progress marker; no reset, so the next run resumes.
      expect(fake.cursors).toEqual([{ step: 1 }]);
      expect(fake.closed).toEqual([expect.objectContaining({ status: "failed" })]);
    });

    it("clears the cursor once the stream runs to its end", async () => {
      const fake = fakeStore();

      await runCatalogueIngest({
        store: fake.store,
        source: streamOf([
          { type: "scope-complete", resourceType: "country", cursor: { step: 1 } },
        ]),
      });

      expect(fake.cursors).toEqual([{ step: 1 }, null]);
    });
  });
});

describe("fromRawEntities", () => {
  it("announces every scope it saw, but only after the stream ends cleanly", async () => {
    const fake = fakeStore([{ resourceType: "yacht", externalId: "gone", scopeKey: "102701" }]);

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: fromRawEntities(
        (async function* () {
          yield entity("company", "102701", { id: 102701 });
          yield entity("yacht", "4711001", yachtPayload, "102701");
        })(),
      ),
    });

    expect(summary).toMatchObject({ status: "success", createdCount: 2, sweptScopes: 2 });
    expect(fake.record("yacht", "gone")?.active).toBe(false);
  });

  it("announces nothing when the stream throws", async () => {
    const fake = fakeStore([{ resourceType: "yacht", externalId: "gone", scopeKey: "102701" }]);

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: fromRawEntities(
        (async function* () {
          yield entity("yacht", "4711001", yachtPayload, "102701");
          throw new TransientError("connection reset");
        })(),
      ),
    });

    expect(summary).toMatchObject({ aborted: true, sweptScopes: 0 });
    expect(fake.record("yacht", "gone")?.active).toBe(true);
  });
});

/*
 * The write side of the same hot path `findRecords` batches. A first Booking Manager
 * import is ~21k records, and a transaction each is four round trips each against a
 * database a network hop away.
 */
describe("runCatalogueIngest write batching", () => {
  const changed = (externalId: string) =>
    ({
      type: "entity",
      entity: entity("yacht", externalId, { id: externalId }, "102701"),
    }) satisfies CatalogueSyncEvent;

  it("writes a whole flush in one statement", async () => {
    const fake = fakeStore();

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        changed("1"),
        changed("2"),
        changed("3"),
        { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
      ]),
    });

    expect(summary).toMatchObject({ status: "success", createdCount: 3 });
    expect(fake.roundTrips().write).toBe(1);
    expect(fake.writeBatches()).toEqual([["1", "2", "3"]]);
  });

  it("still counts a create apart from an update", async () => {
    const fake = fakeStore([
      { resourceType: "yacht", externalId: "1", sourceHash: "old", scopeKey: "102701" },
    ]);

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([changed("1"), changed("2")]),
    });

    expect(summary).toMatchObject({ createdCount: 1, updatedCount: 1 });
  });

  it("re-runs a failed batch one at a time so the blame lands on the right record", async () => {
    const fake = fakeStore();
    fake.rejectWrite("2", new TransientError("duplicate key"));

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([changed("1"), changed("2"), changed("3")]),
    });

    // One failure, and the two innocent records in the same batch still landed.
    expect(summary).toMatchObject({ status: "partial", createdCount: 2, failedCount: 1 });
    expect(fake.record("yacht", "1")).toBeDefined();
    expect(fake.record("yacht", "3")).toBeDefined();
    expect(fake.record("yacht", "2")).toBeUndefined();
    // The batch, then one statement per record in it.
    expect(fake.writeBatches()).toEqual([["1", "2", "3"], ["1"], ["2"], ["3"]]);
  });

  it("blocks the sweep of a scope whose record could not be written", async () => {
    const fake = fakeStore([
      // Present from an earlier run and absent from this dump, so a sweep that was
      // allowed to run would deactivate it.
      { resourceType: "yacht", externalId: "9", sourceHash: "old", scopeKey: "102701" },
    ]);
    fake.rejectWrite("2", new TransientError("duplicate key"));

    await runCatalogueIngest({
      store: fake.store,
      source: streamOf([
        changed("1"),
        changed("2"),
        { type: "scope-complete", resourceType: "yacht", scopeKey: "102701" },
      ]),
    });

    expect(fake.record("yacht", "9")?.active).toBe(true);
  });

  it("aborts the run rather than retrying when the batch fails fatally", async () => {
    const fake = fakeStore();
    fake.rejectWrite("2", new AuthError("credentials rejected"));

    const summary = await runCatalogueIngest({
      store: fake.store,
      source: streamOf([changed("1"), changed("2"), changed("3")]),
    });

    expect(summary).toMatchObject({ status: "failed", aborted: true });
    // No per-record retry: an auth failure repeats on every one of them.
    expect(fake.writeBatches()).toEqual([["1", "2", "3"]]);
  });
});
