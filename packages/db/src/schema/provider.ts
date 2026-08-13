import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

export const providerResourceType = pgEnum("provider_resource_type", [
  "yacht",
  "company",
  "base",
  "location",
  "region",
  "country",
  "model",
  "builder",
  "category",
  "amenity",
  "country_state",
  "equipment_category",
  "service",
  "price_measure",
  "season",
  "price_list",
  "discount_item",
  "sail_type",
  "steering_type",
  "engine_builder",
]);

export const syncKind = pgEnum("sync_kind", ["catalogue", "availability", "pricing"]);

export const syncStatus = pgEnum("sync_status", [
  "pending",
  "running",
  "success",
  "failed",
  "partial",
]);

export const syncErrorType = pgEnum("sync_error_type", [
  "rate_limited",
  "transient",
  "auth",
  "not_found",
  "contract",
]);

export const provider = pgTable("provider", {
  id: id("prv"),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  defaultCurrency: text("default_currency"),
  config: jsonb("config"),
  ...timestamps,
});

// Immutable append-only capture of the exact provider response (replay/audit).
export const providerRawPayload = pgTable("provider_raw_payload", {
  id: id("praw"),
  providerId: text("provider_id")
    .notNull()
    .references(() => provider.id, { onDelete: "restrict" }),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const providerRecord = pgTable(
  "provider_record",
  {
    id: id("prec"),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "restrict" }),
    resourceType: providerResourceType("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    rawPayloadId: text("raw_payload_id").references(() => providerRawPayload.id, {
      onDelete: "set null",
    }),
    sourceHash: text("source_hash"),
    sourceModifiedAt: timestamp("source_modified_at"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
    active: boolean("active").default(true).notNull(),
    // Stamp-and-sweep removal detection: the vendors ship full dumps with no
    // tombstones, so a record absent from a clean dump is deactivated by comparing
    // lastSeenAt against the run that stamped it.
    lastSeenAt: timestamp("last_seen_at"),
    lastSeenSyncRunId: text("last_seen_sync_run_id").references(() => syncRun.id, {
      onDelete: "set null",
    }),
    // Bounds the sweep, e.g. the owning company for a yacht — one company's failed
    // fetch must never deactivate another company's fleet.
    scopeKey: text("scope_key"),
    ...timestamps,
  },
  (t) => [
    // Import idempotency key.
    unique("provider_record_external_uq").on(t.providerId, t.resourceType, t.externalId),
    index("provider_record_sweep_idx").on(t.providerId, t.resourceType, t.scopeKey, t.lastSeenAt),
  ],
);

export const syncRun = pgTable(
  "sync_run",
  {
    id: id("sync"),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "restrict" }),
    kind: syncKind("kind").notNull(),
    status: syncStatus("status").default("pending").notNull(),
    cursor: text("cursor"),
    createdCount: integer("created_count").default(0).notNull(),
    updatedCount: integer("updated_count").default(0).notNull(),
    skippedCount: integer("skipped_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    ...timestamps,
  },
  /*
   * At most one run in flight per provider and kind. This is the lock: the nightly
   * cron and an operator pressing the admin button five minutes later used to
   * start two full walks over the same records and the same cursor row, with
   * nothing anywhere to stop them.
   *
   * Expressed as a constraint rather than an advisory lock so it is visible in the
   * schema and so a double start fails cleanly at the insert, where the caller can
   * report it, rather than silently interleaving. Different providers are
   * unaffected and still sync concurrently, which is the point.
   */
  (t) => [
    uniqueIndex("sync_run_in_flight_uq")
      .on(t.providerId, t.kind)
      .where(sql`${t.status} in ('pending', 'running')`),
  ],
);

export const syncError = pgTable("sync_error", {
  id: id("serr"),
  syncRunId: text("sync_run_id")
    .notNull()
    .references(() => syncRun.id, { onDelete: "cascade" }),
  errorType: syncErrorType("error_type").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Our own resume marker: no vendor exposes a cursor token, so an aborted long run
 * restarts from the last position we recorded rather than from zero.
 */
export const syncCursor = pgTable(
  "sync_cursor",
  {
    id: id("scur"),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "restrict" }),
    kind: syncKind("kind").notNull(),
    scope: text("scope").notNull(),
    cursor: text("cursor"),
    ...timestamps,
  },
  (t) => [unique("sync_cursor_scope_uq").on(t.providerId, t.kind, t.scope)],
);

export const providerRelations = relations(provider, ({ many }) => ({
  records: many(providerRecord),
  rawPayloads: many(providerRawPayload),
  syncRuns: many(syncRun),
  syncCursors: many(syncCursor),
}));

export const providerRawPayloadRelations = relations(providerRawPayload, ({ one }) => ({
  provider: one(provider, {
    fields: [providerRawPayload.providerId],
    references: [provider.id],
  }),
}));

export const providerRecordRelations = relations(providerRecord, ({ one }) => ({
  provider: one(provider, {
    fields: [providerRecord.providerId],
    references: [provider.id],
  }),
  rawPayload: one(providerRawPayload, {
    fields: [providerRecord.rawPayloadId],
    references: [providerRawPayload.id],
  }),
  lastSeenSyncRun: one(syncRun, {
    fields: [providerRecord.lastSeenSyncRunId],
    references: [syncRun.id],
  }),
}));

export const syncRunRelations = relations(syncRun, ({ one, many }) => ({
  provider: one(provider, {
    fields: [syncRun.providerId],
    references: [provider.id],
  }),
  errors: many(syncError),
}));

export const syncCursorRelations = relations(syncCursor, ({ one }) => ({
  provider: one(provider, {
    fields: [syncCursor.providerId],
    references: [provider.id],
  }),
}));

export const syncErrorRelations = relations(syncError, ({ one }) => ({
  syncRun: one(syncRun, {
    fields: [syncError.syncRunId],
    references: [syncRun.id],
  }),
}));
