import {
  provider as providerTable,
  providerRecord,
  syncError,
  syncRun,
} from "@yacht-charter/db/schema/provider";
import { env } from "@yacht-charter/env/server";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { describeErrorChain } from "../shared/error-chain";

import type { InventoryProvider } from "../provider";
import type { Database } from "../registry";
import { NotFoundError, ProviderError, toSyncErrorType } from "../shared/errors";
import type { JsonField } from "../shared/json";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { retainRawPayload, stableSourceHash } from "../shared/raw-retention";
import {
  createDrizzlePricePeriodStore,
  supportsSeasonalPrices,
  writeSeasonalPrices,
} from "./price-writer";
import { openSyncRun, releaseSyncRun } from "./run";
import type { ProviderResourceType, RawEntity } from "../types";
import { clearSyncCursor, readSyncCursor, writeSyncCursor } from "./cursor";
import { loadProviderRecordSet, writeCanonicalCatalogue } from "./catalogue-writer";

/* --------------------------------------------------------- ingest protocol */

/**
 * Phase A is a stream of two things, not one.
 *
 * `syncCatalogue` alone cannot express *which* part of a dump succeeded, and the
 * removal sweep is only safe when it knows that. The alternative — reporting
 * completed scopes through the generator's return value — is unusable here: a
 * return value only arrives if the generator runs to completion, which is exactly
 * the case that does not need protecting. A run aborted halfway must still sweep
 * the scopes that finished cleanly before it died, so completion has to be
 * announced as it happens.
 */
export type CatalogueSyncEvent =
  | { type: "entity"; entity: RawEntity }
  | {
      type: "scope-complete";
      resourceType: ProviderResourceType;
      /**
       * The scope whose dump just finished. Omitted when one call covers every
       * scope of the resource type (a global dump), which then sweeps them all.
       */
      scopeKey?: string;
      /** Resume marker covering everything up to and including this scope. */
      cursor?: unknown;
    };

/**
 * Diagnostics a source attaches to a recoverable failure. Values are JSON
 * because the whole context is merged into the error's own sanitized context
 * and written to the `sync_error.context` jsonb column.
 */
export type SyncErrorContext = Record<string, JsonField>;

/** Lets a source report a recoverable failure instead of ending the stream. */
export interface SyncReporter {
  reportError(
    error: unknown,
    scope?: {
      resourceType?: ProviderResourceType;
      scopeKey?: string;
      context?: SyncErrorContext;
    },
  ): Promise<void>;
}

export type CatalogueSyncSource = (reporter: SyncReporter) => AsyncIterable<CatalogueSyncEvent>;

/** A provider that can report scope completion; `syncCatalogue` cannot. */
export interface ScopedCatalogueProvider {
  createCatalogueSyncSource(options: { resume?: unknown }): CatalogueSyncSource;
}

export function supportsScopedCatalogueSync(
  provider: InventoryProvider,
): provider is InventoryProvider & ScopedCatalogueProvider {
  return "createCatalogueSyncSource" in provider;
}

/**
 * Adapts a plain `AsyncIterable<RawEntity>` to the event protocol.
 *
 * Completion is announced only after the stream ends normally, which is the exact
 * condition the sweep needs: if the whole dump was delivered without throwing,
 * every scope in it was fetched cleanly. A stream that throws announces nothing,
 * so nothing is deactivated.
 */
export function fromRawEntities(entities: AsyncIterable<RawEntity>): CatalogueSyncSource {
  return async function* source() {
    const scopes = new Map<string, { resourceType: ProviderResourceType; scopeKey?: string }>();

    for await (const entity of entities) {
      scopes.set(scopeId(entity.resourceType, entity.scopeKey), {
        resourceType: entity.resourceType,
        scopeKey: entity.scopeKey,
      });
      yield { type: "entity", entity } satisfies CatalogueSyncEvent;
    }

    for (const scope of scopes.values()) {
      yield { type: "scope-complete", ...scope } satisfies CatalogueSyncEvent;
    }
  };
}

/* ------------------------------------------------------------------- store */

export interface ProviderRecordSnapshot {
  id: string;
  sourceHash: string | null;
}

export interface WriteRecordInput {
  resourceType: ProviderResourceType;
  externalId: string;
  scopeKey?: string;
  payload: unknown;
  sourceHash: string;
  seenAt: Date;
}

export interface SweepScopeInput {
  resourceType: ProviderResourceType;
  scopeKey?: string;
  /** Records last seen before this instant were absent from a clean dump. */
  seenBefore: Date;
}

export interface CloseRunInput {
  status: "success" | "partial" | "failed";
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  finishedAt: Date;
}

/**
 * Everything the ingest loop touches, behind one seam. The loop holds the rules
 * that must not regress (hash comparison, sweep safety, abort classification);
 * keeping persistence behind an interface is what makes those rules testable
 * without a database.
 */
export interface CatalogueSyncStore {
  readonly syncRunId: string;
  startRun(startedAt: Date): Promise<void>;
  /**
   * Existing state for a batch of ids of one resource type, keyed by external id.
   * Absent ids are simply missing from the map.
   *
   * Batched rather than per record because this is the hot path of a full dump:
   * a daily re-import of an unchanged catalogue asks this question once per record,
   * and against a remote database the round trip, not the query, is the cost.
   */
  findRecords(
    resourceType: ProviderResourceType,
    externalIds: readonly string[],
  ): Promise<Map<string, ProviderRecordSnapshot>>;
  writeRecord(input: WriteRecordInput): Promise<void>;
  /** Unchanged payloads: restamp only, and never write a second raw payload. */
  touchRecords(recordIds: readonly string[], seenAt: Date): Promise<void>;
  sweepScope(input: SweepScopeInput): Promise<number>;
  recordError(input: {
    errorType: ReturnType<typeof toSyncErrorType>;
    message: string;
    context: Record<string, unknown>;
  }): Promise<void>;
  saveCursor(cursor: unknown): Promise<void>;
  closeRun(input: CloseRunInput): Promise<void>;
}

/* ------------------------------------------------------------ ingest phase */

export interface CatalogueIngestSummary {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  deactivatedCount: number;
  /** Scopes that finished cleanly and were therefore swept. */
  sweptScopes: number;
  aborted: boolean;
}

function scopeId(resourceType: ProviderResourceType, scopeKey: string | undefined): string {
  return `${resourceType}::${scopeKey ?? ""}`;
}

const thrownStringSchema = z.string();

function messageOf(error: unknown): string {
  if (error instanceof Error) return describeErrorChain(error);
  return thrownStringSchema.safeParse(error).data ?? "Unknown sync failure";
}

function contextOf(error: unknown, extra: SyncErrorContext | undefined) {
  const base = error instanceof ProviderError ? error.sanitizedContext() : {};
  return { ...base, ...extra };
}

/**
 * Entities held before a round trip to the database.
 *
 * The win is per batch, not per record, so the exact figure matters far less than
 * being well above one: at 500 a full Booking Manager dump trades roughly fifty
 * thousand sequential queries for a few hundred. Bounded because the buffer holds
 * whole vendor payloads, and because a batch is also the unit of work an abort
 * throws away.
 */
const INGEST_BATCH_SIZE = 500;

/** Identity of a provider record within one run: the pair its unique index uses. */
function recordKey(resourceType: ProviderResourceType, externalId: string): string {
  return `${resourceType}::${externalId}`;
}

/** Auth and contract failures repeat on every subsequent call; nothing else does. */
function isFatal(error: unknown): boolean {
  const type = toSyncErrorType(error);
  return type === "auth" || type === "contract";
}

export async function runCatalogueIngest(options: {
  store: CatalogueSyncStore;
  source: CatalogueSyncSource;
  now?: () => Date;
}): Promise<CatalogueIngestSummary> {
  const { store, source } = options;
  const now = options.now ?? (() => new Date());
  const startedAt = now();

  await store.startRun(startedAt);

  const failedScopes = new Set<string>();
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let deactivatedCount = 0;
  let sweptScopes = 0;
  let aborted = false;

  const reporter: SyncReporter = {
    async reportError(error, scope) {
      failedCount += 1;
      if (scope?.resourceType) {
        failedScopes.add(scopeId(scope.resourceType, scope.scopeKey));
      }
      await store.recordError({
        errorType: toSyncErrorType(error),
        message: messageOf(error),
        context: contextOf(error, scope?.context),
      });
    },
  };

  const isSweepable = (resourceType: ProviderResourceType, scopeKey: string | undefined) => {
    // A whole-type failure blocks every scope of that type, including a global sweep.
    if (failedScopes.has(scopeId(resourceType, undefined))) return false;
    if (scopeKey !== undefined) return !failedScopes.has(scopeId(resourceType, scopeKey));
    return ![...failedScopes].some((key) => key.startsWith(`${resourceType}::`));
  };

  /*
   * Entities wait here until a flush. Keyed by resource type and external id, last
   * write winning, which is what the unswept sequential loop did with a repeated id
   * anyway - and deduping is what lets the flush trust its own snapshot: without it,
   * the second copy of an id would be judged against state the first copy replaced.
   */
  const pending = new Map<string, { entity: RawEntity; sourceHash: string }>();

  /**
   * Writes everything buffered so far.
   *
   * MUST run before any sweep and before any cursor save. A sweep deactivates every
   * record of its scope not seen since `startedAt`, so flushing after one would
   * deactivate the fleet this run had just read but not yet stamped; a cursor saved
   * over unflushed entities would skip them for good on the next resume.
   */
  async function flushPending(): Promise<void> {
    if (pending.size === 0) return;
    const batch = [...pending.values()];
    pending.clear();

    const idsByType = new Map<ProviderResourceType, string[]>();
    for (const { entity } of batch) {
      const ids = idsByType.get(entity.resourceType);
      if (ids) ids.push(entity.externalId);
      else idsByType.set(entity.resourceType, [entity.externalId]);
    }

    const known = new Map<string, ProviderRecordSnapshot>();
    const unreadable = new Set<ProviderResourceType>();
    for (const [resourceType, externalIds] of idsByType) {
      try {
        const found = await store.findRecords(resourceType, externalIds);
        for (const [externalId, snapshot] of found) {
          known.set(recordKey(resourceType, externalId), snapshot);
        }
      } catch (error) {
        if (isFatal(error)) throw error;
        // Reported against the whole resource type with no scope key, which blocks
        // every sweep of it: we could not read what exists, and a removal sweep on
        // top of that would delete inventory on the strength of a failed query.
        unreadable.add(resourceType);
        await reporter.reportError(error, {
          resourceType,
          context: { batchSize: externalIds.length },
        });
      }
    }

    // Collected per type so a failed restamp blocks exactly the types it left
    // unstamped, and no others.
    const touchIdsByType = new Map<ProviderResourceType, string[]>();

    for (const { entity, sourceHash } of batch) {
      if (unreadable.has(entity.resourceType)) continue;
      const existing = known.get(recordKey(entity.resourceType, entity.externalId));

      if (existing && existing.sourceHash === sourceHash) {
        // A daily full dump of a stable catalogue would otherwise append a raw
        // payload per record per day, forever.
        const ids = touchIdsByType.get(entity.resourceType);
        if (ids) ids.push(existing.id);
        else touchIdsByType.set(entity.resourceType, [existing.id]);
        skippedCount += 1;
        continue;
      }

      try {
        await store.writeRecord({
          resourceType: entity.resourceType,
          externalId: entity.externalId,
          scopeKey: entity.scopeKey,
          payload: entity.payload,
          sourceHash,
          seenAt: startedAt,
        });

        if (existing) updatedCount += 1;
        else createdCount += 1;
      } catch (error) {
        if (isFatal(error)) throw error;
        await reporter.reportError(error, {
          resourceType: entity.resourceType,
          scopeKey: entity.scopeKey,
          context: { externalId: entity.externalId },
        });
      }
    }

    for (const [resourceType, recordIds] of touchIdsByType) {
      try {
        await store.touchRecords(recordIds, startedAt);
      } catch (error) {
        if (isFatal(error)) throw error;
        // These records still carry an older last_seen_at, so a sweep of this type
        // would now read them as absent from the dump and deactivate them. Marking
        // the type failed is what stops that.
        await reporter.reportError(error, {
          resourceType,
          context: { restamped: recordIds.length },
        });
      }
    }
  }

  try {
    for await (const event of source(reporter)) {
      if (event.type === "entity") {
        const { entity } = event;
        pending.set(recordKey(entity.resourceType, entity.externalId), {
          entity,
          sourceHash: stableSourceHash(entity.payload),
        });
        if (pending.size >= INGEST_BATCH_SIZE) {
          await flushPending();
        }
        continue;
      }

      // Before the sweep and before the cursor, never after either.
      await flushPending();

      if (isSweepable(event.resourceType, event.scopeKey)) {
        deactivatedCount += await store.sweepScope({
          resourceType: event.resourceType,
          scopeKey: event.scopeKey,
          seenBefore: startedAt,
        });
        sweptScopes += 1;
      }

      if (event.cursor !== undefined) {
        await store.saveCursor(event.cursor);
      }
    }

    await flushPending();
  } catch (error) {
    aborted = true;
    // Whatever is still buffered is deliberately dropped rather than flushed. An
    // aborted run saves no cursor, so the next one re-reads these records anyway,
    // and writing on the way out of a failure only risks compounding it.
    pending.clear();
    await reporter.reportError(error, { context: { aborted: true } });
  }

  // The stream ran to its end, so a resume would skip work rather than repeat it.
  if (!aborted) {
    await store.saveCursor(null);
  }

  const status = aborted ? "failed" : failedCount > 0 ? "partial" : "success";
  await store.closeRun({
    status,
    createdCount,
    updatedCount,
    skippedCount,
    failedCount,
    finishedAt: now(),
  });

  return {
    syncRunId: store.syncRunId,
    status,
    createdCount,
    updatedCount,
    skippedCount,
    failedCount,
    deactivatedCount,
    sweptScopes,
    aborted,
  };
}

/* ------------------------------------------------------------ drizzle store */

export interface DrizzleStoreOptions {
  db: Database;
  providerId: string;
  syncRunId: string;
  cursorScope?: string;
}

export function createDrizzleCatalogueSyncStore(options: DrizzleStoreOptions): CatalogueSyncStore {
  const { db, providerId, syncRunId } = options;
  const cursorKey = {
    providerId,
    kind: "catalogue" as const,
    scope: options.cursorScope ?? "full",
  };

  return {
    syncRunId,

    async startRun(startedAt) {
      await db
        .update(syncRun)
        .set({ status: "running", startedAt })
        .where(eq(syncRun.id, syncRunId));
    },

    async findRecords(resourceType, externalIds) {
      const found = new Map<string, ProviderRecordSnapshot>();
      if (externalIds.length === 0) return found;

      const rows = await db
        .select({
          id: providerRecord.id,
          externalId: providerRecord.externalId,
          sourceHash: providerRecord.sourceHash,
        })
        .from(providerRecord)
        .where(
          and(
            eq(providerRecord.providerId, providerId),
            eq(providerRecord.resourceType, resourceType),
            inArray(providerRecord.externalId, [...externalIds]),
          ),
        );

      for (const row of rows) {
        found.set(row.externalId, { id: row.id, sourceHash: row.sourceHash });
      }
      return found;
    },

    async writeRecord(input) {
      // Raw retention and the record that points at it land together or not at all.
      await db.transaction(async (tx) => {
        const rawPayloadId = await retainRawPayload(tx, providerId, input.payload);

        await tx
          .insert(providerRecord)
          .values({
            providerId,
            resourceType: input.resourceType,
            externalId: input.externalId,
            scopeKey: input.scopeKey ?? null,
            rawPayloadId,
            sourceHash: input.sourceHash,
            importedAt: input.seenAt,
            active: true,
            lastSeenAt: input.seenAt,
            lastSeenSyncRunId: syncRunId,
          })
          .onConflictDoUpdate({
            target: [
              providerRecord.providerId,
              providerRecord.resourceType,
              providerRecord.externalId,
            ],
            set: {
              scopeKey: sql`excluded.scope_key`,
              rawPayloadId: sql`excluded.raw_payload_id`,
              sourceHash: sql`excluded.source_hash`,
              importedAt: sql`excluded.imported_at`,
              // Reactivation is symmetric with the sweep: a record that reappears
              // in a dump is live again.
              active: true,
              lastSeenAt: sql`excluded.last_seen_at`,
              lastSeenSyncRunId: sql`excluded.last_seen_sync_run_id`,
              updatedAt: new Date(),
            },
          });
      });
    },

    async touchRecords(recordIds, seenAt) {
      if (recordIds.length === 0) return;

      await db
        .update(providerRecord)
        .set({ active: true, lastSeenAt: seenAt, lastSeenSyncRunId: syncRunId })
        .where(inArray(providerRecord.id, [...recordIds]));
    },

    async sweepScope(input) {
      const rows = await db
        .update(providerRecord)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(providerRecord.providerId, providerId),
            eq(providerRecord.resourceType, input.resourceType),
            eq(providerRecord.active, true),
            input.scopeKey === undefined ? undefined : eq(providerRecord.scopeKey, input.scopeKey),
            or(isNull(providerRecord.lastSeenAt), lt(providerRecord.lastSeenAt, input.seenBefore)),
          ),
        )
        .returning({ id: providerRecord.id });

      return rows.length;
    },

    async recordError(input) {
      await db.insert(syncError).values({
        syncRunId,
        errorType: input.errorType,
        message: input.message.slice(0, 2000),
        context: input.context,
      });
    },

    async saveCursor(cursor) {
      if (cursor === null || cursor === undefined) {
        await clearSyncCursor(db, cursorKey);
        return;
      }
      await writeSyncCursor(db, cursorKey, cursor);
    },

    async closeRun(input) {
      await db
        .update(syncRun)
        .set({
          status: input.status,
          createdCount: input.createdCount,
          updatedCount: input.updatedCount,
          skippedCount: input.skippedCount,
          failedCount: input.failedCount,
          finishedAt: input.finishedAt,
        })
        .where(eq(syncRun.id, syncRunId));

      /* The row is terminal now, so this process stops beating for it and stops promising
         to close it on shutdown — it has one fewer run to answer for, not none. */
      releaseSyncRun(syncRunId);
    },
  };
}

/* -------------------------------------------------------------- entry points */

/**
 * Whether this provider's listings publish as they import.
 *
 * Two sources, in this order. `provider.config.autoPublish` is the real one: it is
 * per provider, changes without a deploy, and travels with the row between
 * environments. `PROVIDER_AUTO_PUBLISH` is a comma-separated list of provider
 * codes that bootstraps it, because the config column needs database access and an
 * operator who only has the deploy platform still has to be able to turn this on.
 *
 * The column wins whenever it says anything at all, including `false`: an explicit
 * "do not publish" must not be silently overridden by a stale environment variable.
 * Neither speaking means false, since the safe reading of "no opinion recorded" is
 * that inventory still needs review.
 */
const providerConfigSchema = z.object({ autoPublish: z.boolean() });

export async function readAutoPublish(
  db: Database,
  providerId: string,
  providerCode?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ config: providerTable.config, code: providerTable.code })
    .from(providerTable)
    .where(eq(providerTable.id, providerId))
    .limit(1);

  // `provider.config` is jsonb, so the column type tells us nothing; an explicit
  // flag wins over the per-provider default below, anything else falls through.
  const configured = providerConfigSchema.safeParse(row?.config);
  if (configured.success) return configured.data.autoPublish;

  const code = providerCode ?? row?.code;
  if (!code) return false;

  return (env.PROVIDER_AUTO_PUBLISH ?? "")
    .split(",")
    .map((item: string) => item.trim())
    .includes(code);
}

export async function resolveProviderId(db: Database, code: string): Promise<string> {
  const [row] = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, code))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`No provider row registered for "${code}"`, { providerCode: code });
  }
  return row.id;
}

/** Display name for a provider row this package bootstraps for the first time. */
const PROVIDER_DISPLAY_NAME = new Map([
  ["nausys", "NauSYS"],
  ["mock", "Mock Inventory Provider"],
  ["booking_manager", "Booking Manager"],
]);

/**
 * Like `resolveProviderId`, but creates the row (enabled, EUR default) the first
 * time this provider syncs instead of throwing — for one-off ops scripts run
 * against a database that has never registered it (e.g. an empty staging DB).
 * `code` is unique, so a concurrent creator just wins the insert and this reads
 * its row back rather than erroring.
 */
export async function ensureProviderId(db: Database, code: string): Promise<string> {
  try {
    return await resolveProviderId(db, code);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }

  await db
    .insert(providerTable)
    .values({
      code,
      name: PROVIDER_DISPLAY_NAME.get(code) ?? code,
      enabled: true,
      defaultCurrency: "EUR",
    })
    .onConflictDoNothing();

  return resolveProviderId(db, code);
}

export interface CatalogueSyncProgress {
  providerRecordTotal: number;
  syncErrorTotal: number;
  /**
   * Records this run has reached, changed or not.
   *
   * The one number that always moves. `providerRecordTotal` counts every record the
   * provider has, so a re-walk of an unchanged catalogue - the ordinary case - leaves
   * it frozen, and a job doing thousands of round trips a minute looks identical to a
   * hung one. Every record the ingest touches is stamped with the run that touched it,
   * so this counts the walk rather than its result.
   */
  recordsSeenThisRun: number;
  /** Companies swept and companies known, when the connector walks them one at a time. */
  companyIndex: number | null;
  companyTotal: number;
}

/**
 * Coarse progress for a run in flight. `closeRun` only writes sync_run's own
 * created/updated/skipped/failed counters once, at the very end, so a caller
 * watching an in-progress run (an operator tailing a long import, say) has
 * nothing to poll there — this reads the tables the ingest writes to as it goes
 * instead.
 */
export async function readCatalogueSyncProgress(
  db: Database,
  providerId: string,
  syncRunId: string,
): Promise<CatalogueSyncProgress> {
  const [records] = await db
    .select({
      total: sql<number>`count(*)::int`,
      seen: sql<number>`count(*) filter (where ${providerRecord.lastSeenSyncRunId} = ${syncRunId})::int`,
      companies: sql<number>`count(*) filter (where ${providerRecord.resourceType} = 'company')::int`,
    })
    .from(providerRecord)
    .where(eq(providerRecord.providerId, providerId));
  const [errors] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(syncError)
    .where(eq(syncError.syncRunId, syncRunId));

  // Read from the cursor rather than threaded out of the loop: it is written on every
  // scope completion anyway, and a progress reader that needs no hook into the run
  // cannot slow it down or mis-report when it is the run that is stuck.
  const cursor = await readSyncCursor(db, { providerId, kind: "catalogue", scope: "full" });
  const parsed = z.object({ companyIndex: z.number().int().min(0) }).safeParse(cursor);

  return {
    providerRecordTotal: records?.total ?? 0,
    syncErrorTotal: errors?.total ?? 0,
    recordsSeenThisRun: records?.seen ?? 0,
    companyIndex: parsed.success ? parsed.data.companyIndex : null,
    companyTotal: records?.companies ?? 0,
  };
}

/** Created before the work starts so a caller can return the id and walk away. */
/**
 * Raised when a run of the same provider and kind is already pending or running.
 *
 * Separate from `ProviderError` on purpose: nothing went wrong with the vendor,
 * so this must not reach `sync_error` or a retry. It is a scheduling collision,
 * and the caller's job is to report it rather than start a second walk.
 */
export function openCatalogueSyncRun(db: Database, providerId: string): Promise<string> {
  return openSyncRun(db, providerId, "catalogue");
}

export interface CatalogueSyncJobOptions {
  db: Database;
  provider: InventoryProvider;
  providerId: string;
  syncRunId: string;
  resume?: unknown;
  cursorScope?: string;
  now?: () => Date;
  /**
   * Called as the job moves between its three phases.
   *
   * Only the ingest phase writes `provider_record`, so a caller polling the database
   * for progress sees every number freeze the moment the walk ends - which is exactly
   * when the run still has its projection and its price sweep to do. Without this, a
   * job eight minutes into pricing and a hung one look identical.
   */
  onPhase?: (phase: CatalogueSyncPhase) => void;
}

export interface CatalogueSyncJobResult extends CatalogueIngestSummary {
  listingsCreated: number;
  listingsUpdated: number;
  /** Listings the projection could not write; the rest of the run still landed. */
  listingsFailed: number;
  listingsHidden: number;
  duplicateCandidates: number;
  /**
   * Seasonal price periods written. Phase C, and only for providers that publish a
   * price list. It ran in the hourly availability sync until the volume made the
   * cadence indefensible - see `sync/price-writer.ts`.
   */
  pricePeriods: number;
}

/**
 * The two phases end to end. Phase A never interprets a provider field; Phase B is
 * the provider's own pure projection over everything ingested so far, which is why
 * it can run even after a partial ingest.
 */
export type CatalogueSyncPhase = "ingest" | "project" | "prices";

export async function runCatalogueSyncJob(
  options: CatalogueSyncJobOptions,
): Promise<CatalogueSyncJobResult> {
  const { db, provider, providerId, syncRunId } = options;
  const now = options.now ?? (() => new Date());

  const store = createDrizzleCatalogueSyncStore({
    db,
    providerId,
    syncRunId,
    cursorScope: options.cursorScope,
  });

  options.onPhase?.("ingest");

  const source = supportsScopedCatalogueSync(provider)
    ? provider.createCatalogueSyncSource({ resume: options.resume })
    : fromRawEntities(provider.syncCatalogue());

  const ingest = await runCatalogueIngest({ store, source, now });

  const empty = {
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsFailed: 0,
    listingsHidden: 0,
    duplicateCandidates: 0,
    pricePeriods: 0,
  };

  // An aborted ingest leaves the record set mid-dump and its sweeps unrun; projecting
  // it would publish a half-read catalogue.
  if (ingest.aborted) {
    return { ...ingest, ...empty };
  }

  options.onPhase?.("project");

  let written: Awaited<ReturnType<typeof writeCanonicalCatalogue>>;
  try {
    const records = await loadProviderRecordSet(db, providerId);
    const catalogue = provider.projectCatalogue(records);
    written = await writeCanonicalCatalogue({
      db,
      providerId,
      providerKey: provider.key,
      catalogue,
      autoPublish: await readAutoPublish(db, providerId),
      reportListingError: async ({ externalId, error }) => {
        await store.recordError({
          errorType: toSyncErrorType(error),
          message: messageOf(error),
          context: contextOf(error, { phase: "project", resourceType: "yacht", externalId }),
        });
      },
      now: now(),
    });
  } catch (error) {
    await store.recordError({
      errorType: toSyncErrorType(error),
      message: messageOf(error),
      context: contextOf(error, { phase: "project" }),
    });
    await store.closeRun({
      status: "failed",
      createdCount: ingest.createdCount,
      updatedCount: ingest.updatedCount,
      skippedCount: ingest.skippedCount,
      failedCount: ingest.failedCount + 1,
      finishedAt: now(),
    });

    return {
      ...ingest,
      ...empty,
      status: "failed",
      failedCount: ingest.failedCount + 1,
    };
  }

  /*
   * Phase C: the price list, for the listings this run refreshed.
   *
   * Reported rather than thrown. The catalogue is already written and correct by this
   * point, and a vendor's price endpoint failing is not a reason to call the whole
   * import failed - the previous run's prices are still there, and the next one will
   * try again. It does downgrade the run to `partial` so the failure is visible.
   */
  let pricePeriods = 0;
  let priceFailures = 0;

  if (supportsSeasonalPrices(provider)) {
    options.onPhase?.("prices");
    try {
      pricePeriods = await writeSeasonalPrices({
        store: createDrizzlePricePeriodStore({ db, providerId }),
        listingIds: written.touchedListingIds,
        loadSeasonalPrices: (listingIds) => provider.loadSeasonalPrices(listingIds),
      });

      /*
       * Rebuilt again, because phase B already rebuilt these documents and did it
       * before the rates existed. `bookable_from` and the card's "from" price are
       * materialised from `listing_price_period`, so a first run would otherwise
       * publish a boat whose detail-page calendar opens and whose card beside it
       * reports no availability - and it would stay that way until some later run
       * happened to rebuild the document for another reason.
       */
      if (pricePeriods > 0) {
        await rebuildSearchReadModelsAfterSync(db, { listingIds: written.touchedListingIds });
      }
    } catch (error) {
      priceFailures = 1;
      await store.recordError({
        errorType: toSyncErrorType(error),
        message: messageOf(error),
        context: contextOf(error, { phase: "prices" }),
      });
    }
  }

  /*
   * A run that dropped listings is not a success, whatever the ingest thought. It is
   * not a failure either: the rest of the catalogue is written and correct, and
   * calling it failed would hide that behind a word that means "nothing landed".
   */
  const degraded = priceFailures > 0 || written.listingsFailed > 0;
  const status = degraded && ingest.status === "success" ? "partial" : ingest.status;

  if (priceFailures > 0) {
    await store.closeRun({
      status,
      createdCount: ingest.createdCount,
      updatedCount: ingest.updatedCount,
      skippedCount: ingest.skippedCount,
      failedCount: ingest.failedCount + priceFailures,
      finishedAt: now(),
    });
  }

  return {
    ...ingest,
    status,
    failedCount: ingest.failedCount + priceFailures,
    listingsCreated: written.listingsCreated,
    listingsFailed: written.listingsFailed,
    listingsUpdated: written.listingsUpdated,
    listingsHidden: written.listingsHidden,
    duplicateCandidates: written.duplicateCandidates,
    pricePeriods,
  };
}
