import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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
    ...timestamps,
  },
  // Import idempotency key.
  (t) => [unique("provider_record_external_uq").on(t.providerId, t.resourceType, t.externalId)],
);

export const syncRun = pgTable("sync_run", {
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
});

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

export const providerRelations = relations(provider, ({ many }) => ({
  records: many(providerRecord),
  rawPayloads: many(providerRawPayload),
  syncRuns: many(syncRun),
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
}));

export const syncRunRelations = relations(syncRun, ({ one, many }) => ({
  provider: one(provider, {
    fields: [syncRun.providerId],
    references: [provider.id],
  }),
  errors: many(syncError),
}));

export const syncErrorRelations = relations(syncError, ({ one }) => ({
  syncRun: one(syncRun, {
    fields: [syncError.syncRunId],
    references: [syncRun.id],
  }),
}));
