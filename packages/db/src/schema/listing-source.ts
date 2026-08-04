import { relations } from "drizzle-orm";
import { index, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, pct, timestamps } from "./_shared";
import { listing } from "./listing";
import { providerRecord } from "./provider";

export const matchStatus = pgEnum("match_status", ["unmatched", "auto", "confirmed", "rejected"]);

export const duplicateDecision = pgEnum("duplicate_decision", ["pending", "confirmed", "rejected"]);

export const listingSource = pgTable(
  "listing_source",
  {
    id: id("lsrc"),
    listingId: text("listing_id").references(() => listing.id, {
      onDelete: "set null",
    }),
    providerRecordId: text("provider_record_id")
      .notNull()
      .references(() => providerRecord.id, { onDelete: "restrict" }),
    externalYachtId: text("external_yacht_id").notNull(),
    externalCompanyId: text("external_company_id"),
    externalBaseId: text("external_base_id"),
    matchStatus: matchStatus("match_status").default("unmatched").notNull(),
    matchConfidence: pct("match_confidence"),
    matchedBy: text("matched_by"),
    matchedAt: timestamp("matched_at"),
    ...timestamps,
  },
  (t) => [
    index("listing_source_listing_idx").on(t.listingId),
    index("listing_source_provider_record_idx").on(t.providerRecordId),
  ],
);

export const listingDuplicateCandidate = pgTable(
  "listing_duplicate_candidate",
  {
    id: id("ldup"),
    sourceAId: text("source_a_id")
      .notNull()
      .references(() => listingSource.id, { onDelete: "cascade" }),
    sourceBId: text("source_b_id")
      .notNull()
      .references(() => listingSource.id, { onDelete: "cascade" }),
    signals: jsonb("signals"),
    confidence: numeric("confidence", { precision: 6, scale: 4 }),
    decision: duplicateDecision("decision").default("pending").notNull(),
    reviewer: text("reviewer"),
    reviewedAt: timestamp("reviewed_at"),
    ...timestamps,
  },
  (t) => [
    index("listing_duplicate_source_a_idx").on(t.sourceAId),
    index("listing_duplicate_source_b_idx").on(t.sourceBId),
  ],
);

export const listingSourceRelations = relations(listingSource, ({ one }) => ({
  listing: one(listing, {
    fields: [listingSource.listingId],
    references: [listing.id],
  }),
  providerRecord: one(providerRecord, {
    fields: [listingSource.providerRecordId],
    references: [providerRecord.id],
  }),
}));

export const listingDuplicateCandidateRelations = relations(
  listingDuplicateCandidate,
  ({ one }) => ({
    sourceA: one(listingSource, {
      fields: [listingDuplicateCandidate.sourceAId],
      references: [listingSource.id],
      relationName: "duplicate_source_a",
    }),
    sourceB: one(listingSource, {
      fields: [listingDuplicateCandidate.sourceBId],
      references: [listingSource.id],
      relationName: "duplicate_source_b",
    }),
  }),
);
