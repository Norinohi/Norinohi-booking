import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { id, money, pct, timestamps } from "./_shared";
import { listing } from "./listing";
import { providerRecord } from "./provider";

export const matchStatus = pgEnum("match_status", ["unmatched", "auto", "confirmed", "rejected"]);

export const duplicateDecision = pgEnum("duplicate_decision", ["pending", "confirmed", "rejected"]);

/**
 * Which of the provider's id spaces `external_id` belongs to. NauSYS numbers
 * services and equipment independently, so the pair is the identity and this
 * column is what stops service 17 overwriting equipment 17.
 */
export const providerExtraKind = pgEnum("provider_extra_kind", ["service", "equipment"]);

/**
 * What a provider sells alongside the hull, at its published season list price.
 *
 * Deliberately not folded into `listing_amenity`: that table answers "what does
 * this yacht have", and every row in it is included equipment. An extra is a
 * thing the customer pays for, lives in a different id space, and may name the
 * same equipment that is already fitted as standard — merging the two made all
 * three detail sections read from one set of columns and silenced two of them.
 *
 * The price here is indicative. Binding prices come from the offer path, which
 * quotes the same items for concrete dates, quantity and duration.
 */
export const providerExtraCatalogue = pgTable(
  "provider_extra_catalogue",
  {
    id: id("pxtr"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    // Scoped like listing_media.source so a merged listing keeps each provider's rows.
    source: text("source").notNull(),
    kind: providerExtraKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    obligatory: boolean("obligatory").default(false).notNull(),
    ...money("price"),
    priceMeasure: text("price_measure"),
    calculationType: text("calculation_type"),
    onRequestOnly: boolean("on_request_only").default(false).notNull(),
    externalSeasonId: text("external_season_id"),
    externalBaseId: text("external_base_id"),
    ...timestamps,
  },
  (t) => [
    unique("provider_extra_catalogue_uq").on(t.listingId, t.source, t.kind, t.externalId),
    index("provider_extra_catalogue_listing_idx").on(t.listingId),
  ],
);

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
    // One source row per provider record. Without it two concurrent runs of the
    // same provider both read no existing link and both insert, leaving one yacht
    // with two sources pointing at two listings.
    uniqueIndex("listing_source_provider_record_uq").on(t.providerRecordId),
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
    // Orientation-independent: the generator's own "not exists" check tests both
    // (A,B) and (B,A), and under concurrency two runs pass it together. Keying on
    // the sorted pair is what actually stops the reviewer being handed the same
    // boat twice, mirrored.
    uniqueIndex("listing_duplicate_pair_uq").on(
      sql`least(${t.sourceAId}, ${t.sourceBId})`,
      sql`greatest(${t.sourceAId}, ${t.sourceBId})`,
    ),
  ],
);

export const providerExtraCatalogueRelations = relations(providerExtraCatalogue, ({ one }) => ({
  listing: one(listing, {
    fields: [providerExtraCatalogue.listingId],
    references: [listing.id],
  }),
}));

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
