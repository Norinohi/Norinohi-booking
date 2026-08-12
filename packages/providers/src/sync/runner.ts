import {
  provider as providerTable,
  providerRecord,
  syncError,
  syncRun,
} from "@yacht-charter/db/schema/provider";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { InventoryProvider } from "../provider";
import type { Database } from "../registry";
import { NotFoundError, ProviderError, toSyncErrorType } from "../shared/errors";
import { retainRawPayload, stableSourceHash } from "../shared/raw-retention";
import type { ProviderResourceType, RawEntity } from "../types";
import { clearSyncCursor, writeSyncCursor } from "./cursor";
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

/** Lets a source report a recoverable failure instead of ending the stream. */
export interface SyncReporter {
  reportError(
    error: unknown,
    scope?: {
      resourceType?: ProviderResourceType;
      scopeKey?: string;
      context?: Record<string, unknown>;
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
  return (
    typeof (provider as Partial<ScopedCatalogueProvider>).createCatalogueSyncSource === "function"
  );
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
  findRecord(
    resourceType: ProviderResourceType,
    externalId: string,
  ): Promise<ProviderRecordSnapshot | null>;
  writeRecord(input: WriteRecordInput): Promise<void>;
  /** Unchanged payload: restamp only, and never write a second raw payload. */
  touchRecord(recordId: string, seenAt: Date): Promise<void>;
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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown sync failure";
}

function contextOf(error: unknown, extra: Record<string, unknown> | undefined) {
  const base = error instanceof ProviderError ? error.sanitizedContext() : {};
  return { ...base, ...extra };
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

  try {
    for await (const event of source(reporter)) {
      if (event.type === "entity") {
        const { entity } = event;
        try {
          const sourceHash = stableSourceHash(entity.payload);
          const existing = await store.findRecord(entity.resourceType, entity.externalId);

          if (existing && existing.sourceHash === sourceHash) {
            // A daily full dump of a stable catalogue would otherwise append a raw
            // payload per record per day, forever.
            await store.touchRecord(existing.id, startedAt);
            skippedCount += 1;
            continue;
          }

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
        continue;
      }

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
  } catch (error) {
    aborted = true;
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

    async findRecord(resourceType, externalId) {
      const [row] = await db
        .select({ id: providerRecord.id, sourceHash: providerRecord.sourceHash })
        .from(providerRecord)
        .where(
          and(
            eq(providerRecord.providerId, providerId),
            eq(providerRecord.resourceType, resourceType),
            eq(providerRecord.externalId, externalId),
          ),
        )
        .limit(1);

      return row ?? null;
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

    async touchRecord(recordId, seenAt) {
      await db
        .update(providerRecord)
        .set({ active: true, lastSeenAt: seenAt, lastSeenSyncRunId: syncRunId })
        .where(eq(providerRecord.id, recordId));
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
    },
  };
}

/* -------------------------------------------------------------- entry points */

/**
 * Whether this provider's listings publish as they import.
 *
 * Lives in `provider.config` rather than an environment variable so it is set per
 * provider and changed without a deploy, and so it travels with the provider row
 * across environments. Absent or unreadable means false: the safe reading of "no
 * opinion recorded" is that inventory still needs review.
 */
export async function readAutoPublish(db: Database, providerId: string): Promise<boolean> {
  const [row] = await db
    .select({ config: providerTable.config })
    .from(providerTable)
    .where(eq(providerTable.id, providerId))
    .limit(1);

  const config = row?.config;
  if (typeof config !== "object" || config === null) return false;
  return (config as { autoPublish?: unknown }).autoPublish === true;
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
const PROVIDER_DISPLAY_NAME: Record<string, string> = {
  nausys: "NauSYS",
  mock: "Mock Inventory Provider",
  booking_manager: "Booking Manager",
};

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
      name: PROVIDER_DISPLAY_NAME[code] ?? code,
      enabled: true,
      defaultCurrency: "EUR",
    })
    .onConflictDoNothing();

  return resolveProviderId(db, code);
}

export interface CatalogueSyncProgress {
  providerRecordTotal: number;
  syncErrorTotal: number;
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
    .select({ total: sql<number>`count(*)::int` })
    .from(providerRecord)
    .where(eq(providerRecord.providerId, providerId));
  const [errors] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(syncError)
    .where(eq(syncError.syncRunId, syncRunId));

  return {
    providerRecordTotal: records?.total ?? 0,
    syncErrorTotal: errors?.total ?? 0,
  };
}

/** Created before the work starts so a caller can return the id and walk away. */
export async function openCatalogueSyncRun(db: Database, providerId: string): Promise<string> {
  const [row] = await db
    .insert(syncRun)
    .values({ providerId, kind: "catalogue", status: "pending" })
    .returning({ id: syncRun.id });

  if (!row) {
    throw new Error("sync_run insert returned no row");
  }
  return row.id;
}

export interface CatalogueSyncJobOptions {
  db: Database;
  provider: InventoryProvider;
  providerId: string;
  syncRunId: string;
  resume?: unknown;
  cursorScope?: string;
  now?: () => Date;
}

export interface CatalogueSyncJobResult extends CatalogueIngestSummary {
  listingsCreated: number;
  listingsUpdated: number;
  listingsHidden: number;
  duplicateCandidates: number;
}

/**
 * The two phases end to end. Phase A never interprets a provider field; Phase B is
 * the provider's own pure projection over everything ingested so far, which is why
 * it can run even after a partial ingest.
 */
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

  const source = supportsScopedCatalogueSync(provider)
    ? provider.createCatalogueSyncSource({ resume: options.resume })
    : fromRawEntities(provider.syncCatalogue());

  const ingest = await runCatalogueIngest({ store, source, now });

  const empty = {
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsHidden: 0,
    duplicateCandidates: 0,
  };

  // An aborted ingest leaves the record set mid-dump and its sweeps unrun; projecting
  // it would publish a half-read catalogue.
  if (ingest.aborted) {
    return { ...ingest, ...empty };
  }

  try {
    const records = await loadProviderRecordSet(db, providerId);
    const catalogue = provider.projectCatalogue(records);
    const written = await writeCanonicalCatalogue({
      db,
      providerId,
      providerKey: provider.key,
      catalogue,
      autoPublish: await readAutoPublish(db, providerId),
      now: now(),
    });

    return {
      ...ingest,
      listingsCreated: written.listingsCreated,
      listingsUpdated: written.listingsUpdated,
      listingsHidden: written.listingsHidden,
      duplicateCandidates: written.duplicateCandidates,
    };
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
}
