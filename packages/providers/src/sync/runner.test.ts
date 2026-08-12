import { describe, expect, it, vi } from "vitest";

// runner.ts reads the server env for the auto-publish bootstrap list, and that
// module validates at import time. Hoisted so it lands before the import runs.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

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
    async findRecord(resourceType, externalId) {
      const found = records.get(keyOf(resourceType, externalId));
      return found ? { id: found.id, sourceHash: found.sourceHash } : null;
    },
    async writeRecord(input) {
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
    },
    async touchRecord(recordId, seenAt) {
      for (const record of records.values()) {
        if (record.id === recordId) {
          record.active = true;
          record.lastSeenAt = seenAt;
        }
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
    record: (resourceType: ProviderResourceType, externalId: string) =>
      records.get(keyOf(resourceType, externalId)),
  };
}

const entity = (
  resourceType: ProviderResourceType,
  externalId: string,
  payload: unknown,
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
