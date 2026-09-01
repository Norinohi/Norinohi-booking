import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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
import { listingOffer } from "./listing-offer";
import { providerRecord } from "./provider";

export const matchStatus = pgEnum("match_status", ["unmatched", "auto", "confirmed", "rejected"]);

/**
 * `deferred` is "I looked and I cannot tell", which is neither of the other two. It exists
 * so an undecidable pair can leave the queue without being counted as a rejection, because
 * the precision figure that will one day justify auto-approval is confirmed over
 * confirmed-plus-rejected, and filing every hard case as a rejection would sink it.
 */
export const duplicateDecision = pgEnum("duplicate_decision", [
  "pending",
  "confirmed",
  "rejected",
  "deferred",
]);

/**
 * Which of the provider's id spaces `external_id` belongs to. NauSYS numbers
 * services and equipment independently, so the pair is the identity and this
 * column is what stops service 17 overwriting equipment 17.
 */
export const providerExtraKind = pgEnum("provider_extra_kind", ["service", "equipment"]);

/**
 * The crew role an extra actually is, where it is one.
 *
 * Vendors sell crew as ordinary priced services with nothing marking them as crew,
 * so this is our reading of the service's name rather than anything they state. It
 * stays null when the name does not clearly say: an unrecognised service is sold as
 * a plain extra, never guessed into a skipper.
 *
 * The values match the codes `crewOptionsFor` reads, which is what lets a synced
 * listing offer the same Crew control a seeded one does.
 */
export const providerCrewRole = pgEnum("provider_crew_role", ["skipper", "hostess", "cook"]);

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
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    // Scoped like listing_media.source so a merged listing keeps each provider's rows.
    source: text("source").notNull(),
    kind: providerExtraKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    obligatory: boolean("obligatory").default(false).notNull(),
    crewRole: providerCrewRole("crew_role"),
    ...money("price"),
    priceMeasure: text("price_measure"),
    calculationType: text("calculation_type"),
    /**
     * A fee the operator states as a share of the charter rather than as money: 0.35 is 35%.
     *
     * Stored as the rate because the amount depends on the week being priced, which the
     * catalogue does not know. Without it the projection read the vendor's "0.3500" as a price
     * of 0.35 and then, seeing a zero, filed the fee as free: yacht 75193633 carries a
     * mandatory 35% service charge that the card showed as included, worth 7,910.00 on its
     * own list price. `percentageBasis` is the vendor's own word for what it applies to.
     */
    percentage: numeric("percentage", { precision: 6, scale: 4 }),
    percentageBasis: text("percentage_basis"),
    /**
     * Whether the charter base collects this extra on arrival, rather than it being part of
     * what the booking prepays. Nullable because the two vendors state it differently and
     * neither always states it: Booking Manager sends `payableInBase` on the offer's extras,
     * NauSYS implies it through `calculationType`, and a null means nobody said.
     */
    payableInBase: boolean("payable_in_base"),
    /**
     * The sailing dates this price is for. Providers version a fee by season rather than
     * replacing it, so one listing holds the same fee several times over: the Shannon fleet's
     * boat cleaning is 150 for 2026, 155 for 2027 and 160 for 2028, all three live at once.
     * Without these the catalogue page showed all of them as though they were alternatives.
     */
    seasonStart: date("season_start"),
    seasonEnd: date("season_end"),
    /**
     * The charter lengths in nights this variant is charged for. Providers file a duration
     * ladder as one row per night count, so a fee can differ by length as well as by season:
     * this fleet's moorings fee is 60 EUR up to six nights and 90 from seven.
     */
    validNightsFrom: integer("valid_nights_from"),
    validNightsTo: integer("valid_nights_to"),
    /**
     * Charged only where the charter ends at a different base than it started. Booking Manager
     * states it as `validForBases`, a from/to base pairing that only a one-way fee carries.
     */
    oneWayOnly: boolean("one_way_only").default(false).notNull(),
    /**
     * The provider's own base ids this price applies at, empty meaning everywhere. NauSYS
     * carries one on 130,535 of its 184,539 priced extras rows, and reading them all as
     * unconditional put fees on cards that no charter from that base is charged.
     */
    validForBaseIds: text("valid_for_base_ids").array(),
    /**
     * A floor under a computed total, in minor units. Only meaningful beside `percentage`: a
     * 3% fee with a 50 EUR minimum is 50 EUR on a small charter, not 30.
     *
     * Written but not yet read. The card sums percentage fees into one rate and multiplies the
     * base by it once, and a per-fee floor cannot survive that sum -- honouring it means
     * totalling the fees one at a time. No row in the sampled fleets carries one, so this is
     * the value being kept rather than lost until something needs it.
     */
    minimumPriceMinor: integer("minimum_price_minor"),
    onRequestOnly: boolean("on_request_only").default(false).notNull(),
    /**
     * Buying this lowers the security deposit rather than adding anything to the charter, so
     * the quote answers with the operator's reduced figure instead of the ordinary one.
     */
    depositInsurance: boolean("deposit_insurance").default(false).notNull(),
    externalSeasonId: text("external_season_id"),
    externalBaseId: text("external_base_id"),
    ...timestamps,
  },
  (t) => [
    unique("provider_extra_catalogue_uq").on(t.listingOfferId, t.kind, t.externalId),
    index("provider_extra_catalogue_listing_idx").on(t.listingId),
  ],
);

/**
 * Per-locale display names for a provider's priced extras.
 *
 * Keyed by the extra's identity in the provider's own id space rather than by a
 * `provider_extra_catalogue` row, because that table holds one row per listing per season
 * per duration band: one boat cleaning fee is thousands of rows naming the same service.
 * NauSYS names its services and equipment in eighteen languages, so this is a dictionary of
 * about eighteen hundred entries behind all of them.
 *
 * A missing row leaves `provider_extra_catalogue.name` in place, so a locale the provider
 * does not name degrades to the vendor's own wording rather than to a blank line item.
 */
export const providerExtraTranslation = pgTable(
  "provider_extra_translation",
  {
    id: id("pxtt"),
    /* Mirrors provider_extra_catalogue.source, so two providers' id spaces stay apart. */
    source: text("source").notNull(),
    kind: providerExtraKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("provider_extra_translation_uq").on(t.source, t.kind, t.externalId, t.locale),
    index("provider_extra_translation_lookup_idx").on(t.source, t.kind, t.externalId),
  ],
);

/**
 * Locale labels for a priced extra keyed by its name instead of its id.
 *
 * `provider_extra_translation` above needs the provider to publish a dictionary, and Booking
 * Manager has none: it keys 19,482 service ids for 12,827 distinct names, so "Moorings Fee" is
 * 5,628 separate ids for one fee. An id-keyed row per id would be five thousand rows saying the
 * same word, and would still miss the next fleet that keys it differently.
 *
 * Deliberately not scoped to a provider. These are generic charter fees, and one entry for
 * "Boat Cleaning" is meant to serve whichever vendor writes it that way. That makes it editorial
 * content rather than sourced content: it is curated in `translations/extra-labels.ts` and only
 * ever consulted where the id-keyed table has nothing, so a provider that does publish its own
 * wording always wins.
 *
 * The long tail is deliberately absent. Most of those 12,827 names are free text — insurance
 * terms, package contents, a boat's own name — and translating them by machine would turn
 * contractual wording into an approximation of it.
 */
export const extraLabelTranslation = pgTable(
  "extra_label_translation",
  {
    id: id("xlbl"),
    /** `name` folded the way the read join folds it: lowercase, `&` as "and", alphanumerics. */
    nameKey: text("name_key").notNull(),
    /** The English name as written, kept so a row can be reviewed without decoding its key. */
    name: text("name").notNull(),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    ...timestamps,
  },
  (t) => [unique("extra_label_translation_uq").on(t.nameKey, t.locale)],
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
    reviewerNote: text("reviewer_note"),
    reviewedAt: timestamp("reviewed_at"),
    /**
     * Whether the candidate auto-approval rule would have merged this pair.
     *
     * Computed on every run and acted on by nothing. Auto-approval is only worth turning on
     * once we can say what it would have done to pairs a human has already judged, and that
     * comparison needs the flag to exist before the verdicts do.
     */
    autoEligible: boolean("auto_eligible").default(false).notNull(),
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
