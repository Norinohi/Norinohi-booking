import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { base } from "./geography";
import { listing } from "./listing";
import { listingSource } from "./listing-source";
import { operator } from "./operator";
import { provider } from "./provider";
import { builder, yachtCategory, yachtModel } from "./taxonomy";

const measurement = (name: string) => numeric(name, { precision: 8, scale: 2 });

/**
 * Whether an offer is currently sellable.
 *
 * `retired` is the vendor's doing — the record left its dump and the stamp-and-sweep
 * deactivated it. `suppressed` is ours: a provider we have stopped transacting for a
 * particular boat through, without losing what it published.
 */
export const offerStatus = pgEnum("offer_status", ["active", "suppressed", "retired"]);

/**
 * One provider's sellable proposition for one listing.
 *
 * The listing is the yacht; the offer is a way to buy it. A hull both vendors publish
 * is one listing with two offers, and everything commercial — the calendar, the rates,
 * the deposit, the extras, the check-in rules, the prose — hangs off the offer rather
 * than the listing, because none of it can be merged: two vendors price the same week
 * differently and neither figure is a fact about the boat.
 *
 * Deliberately not folded into `listing_source`, which is the identity table the
 * duplicate queue decides on:
 *
 * - `unique (listing_id, provider_id)` is what stops one vendor's two records bidding
 *   against each other under a cheapest-wins rule, and it cannot be stated on a table
 *   whose `listing_id` is nullable by design.
 * - `listing_source.listing_id` is nullable on purpose: a source can exist attached to
 *   nothing. An offer cannot.
 * - An offer carries lifecycle the identity link does not — whether we still sell it,
 *   and three independent freshness stamps, because catalogue, prices and availability
 *   sync on separate schedules.
 *
 * The columns from `title` down are this provider's own reading of the boat. They are
 * candidates, not the answer: `canonical-listing.ts` resolves the listing's own row from
 * them by the precedence in docs/backend-architecture.md §3.4, so that nothing writes
 * `listing` directly and two syncs can no longer overwrite each other nightly.
 */
export const listingOffer = pgTable(
  "listing_offer",
  {
    id: id("loff"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingSourceId: text("listing_source_id")
      .notNull()
      .references(() => listingSource.id, { onDelete: "cascade" }),
    /* Denormalised from provider_record so the one-offer-per-vendor rule is a constraint. */
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "restrict" }),
    status: offerStatus("status").default("active").notNull(),

    /* Commercial terms: this vendor's, never the listing's. */
    defaultCurrency: text("default_currency"),
    paymentPolicy: jsonb("payment_policy").$type<{
      mode: "deposit" | "full";
      depositPct?: number;
      balanceDueAt?: string;
    }>(),
    securityDepositMinor: integer("security_deposit_minor"),
    /** The deposit this offer takes when the charter carries deposit insurance. */
    securityDepositWhenInsuredMinor: integer("security_deposit_when_insured_minor"),
    securityDepositCurrency: text("security_deposit_currency"),
    depositInsuranceIncluded: boolean("deposit_insurance_included").default(false).notNull(),
    crewType: text("crew_type"),
    providerRating: numeric("provider_rating", { precision: 3, scale: 2 }),
    providerReviewCount: integer("provider_review_count"),

    /* This provider's reading of the boat, resolved into `listing` by precedence. */
    /**
     * The boat's own name as this vendor wrote it, with no model appended. `title` is the two
     * joined; this is the half a screen shows in large type.
     *
     * Distinct from `nameKey` below, which is the same name folded for duplicate matching and
     * is not display text: "Star Kiss" against "starkiss".
     */
    name: text("name"),
    title: text("title"),
    operatorId: text("operator_id").references(() => operator.id, { onDelete: "restrict" }),
    homeBaseId: text("home_base_id").references(() => base.id, { onDelete: "restrict" }),
    builderId: text("builder_id").references(() => builder.id, { onDelete: "set null" }),
    modelId: text("model_id").references(() => yachtModel.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => yachtCategory.id, { onDelete: "set null" }),
    petsAllowed: boolean("pets_allowed").default(false).notNull(),
    /**
     * The boat's own name, as `yachtNameKey` folds it: the title with the model removed
     * and everything but letters and digits stripped.
     *
     * Stored rather than computed in the duplicate join because it is the one signal two
     * feeds for the same hull nearly always agree on and two sister ships never do, and
     * an indexed equality is the only shape that self-join stays tractable in. One
     * implementation of the normalisation, in TypeScript, written at projection time.
     */
    nameKey: text("name_key"),

    catalogueSyncedAt: timestamp("catalogue_synced_at"),
    pricesSyncedAt: timestamp("prices_synced_at"),
    availabilitySyncedAt: timestamp("availability_synced_at"),
    ...timestamps,
  },
  (t) => [
    unique("listing_offer_source_uq").on(t.listingSourceId),
    unique("listing_offer_provider_uq").on(t.listingId, t.providerId),
    /*
     * The target of every child's composite foreign key. Carrying `listing_id` down into
     * the children and pointing the key at this pair is what makes a merge one statement:
     * `update listing_offer set listing_id = ...` and Postgres rewrites the children with
     * it, so the two columns are structurally incapable of disagreeing.
     */
    unique("listing_offer_identity_uq").on(t.id, t.listingId),
    index("listing_offer_listing_idx").on(t.listingId),
    index("listing_offer_name_key_idx").on(t.nameKey),
    index("listing_offer_base_name_idx").on(t.homeBaseId, t.nameKey),
  ],
);

/**
 * One offer's spec block, as that provider published it.
 *
 * `listing_specification` keeps its shape and its one-row-per-listing key, but becomes a
 * projection of these rather than a thing a sync writes: with two providers, whoever ran
 * last used to win, so a merged boat's cabin count changed nightly.
 */
export const listingOfferSpecification = pgTable("listing_offer_specification", {
  id: id("lospec"),
  listingOfferId: text("listing_offer_id")
    .notNull()
    .unique()
    .references(() => listingOffer.id, { onDelete: "cascade" }),
  lengthM: measurement("length_m"),
  beamM: measurement("beam_m"),
  draftM: measurement("draft_m"),
  yearBuilt: integer("year_built"),
  cabins: integer("cabins"),
  berths: integer("berths"),
  heads: integer("heads"),
  showers: integer("showers"),
  engines: integer("engines"),
  enginePower: text("engine_power"),
  fuelType: text("fuel_type"),
  fuelCapacity: integer("fuel_capacity"),
  waterCapacity: integer("water_capacity"),
  propulsionType: text("propulsion_type"),
  steeringType: text("steering_type"),
  sailType: text("sail_type"),
  ...timestamps,
});

/**
 * The field groups the canonical listing is resolved in.
 *
 * Groups rather than columns, because the fields inside one move together: taking the
 * length from one vendor and the beam from another would describe a boat that does not
 * exist.
 */
export const listingField = pgEnum("listing_field", [
  "title",
  "spec",
  "taxonomy",
  "operator",
  "home_base",
  "pets",
  "media",
  "description",
]);

/**
 * Which offer won each field group of the canonical listing.
 *
 * The `selected_source` decision docs/backend-architecture.md §3.4 asks for. Two things
 * hang on it: `locked` rows are an admin's choice and the nightly resolver must not
 * touch them, and the unlocked rows are the resolver showing its work, so a reviewer can
 * see why a merged card carries the title it does.
 */
export const listingFieldSource = pgTable(
  "listing_field_source",
  {
    id: id("lfsr"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    field: listingField("field").notNull(),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    /** An admin's decision. The resolver rewrites everything else on every run. */
    locked: boolean("locked").default(false).notNull(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at"),
    ...timestamps,
  },
  (t) => [
    unique("listing_field_source_uq").on(t.listingId, t.field),
    index("listing_field_source_offer_idx").on(t.listingOfferId),
  ],
);

export const listingOfferRelations = relations(listingOffer, ({ one }) => ({
  listing: one(listing, {
    fields: [listingOffer.listingId],
    references: [listing.id],
  }),
  source: one(listingSource, {
    fields: [listingOffer.listingSourceId],
    references: [listingSource.id],
  }),
  provider: one(provider, {
    fields: [listingOffer.providerId],
    references: [provider.id],
  }),
  specification: one(listingOfferSpecification, {
    fields: [listingOffer.id],
    references: [listingOfferSpecification.listingOfferId],
  }),
}));

export const listingOfferSpecificationRelations = relations(
  listingOfferSpecification,
  ({ one }) => ({
    offer: one(listingOffer, {
      fields: [listingOfferSpecification.listingOfferId],
      references: [listingOffer.id],
    }),
  }),
);

export const listingFieldSourceRelations = relations(listingFieldSource, ({ one }) => ({
  listing: one(listing, {
    fields: [listingFieldSource.listingId],
    references: [listing.id],
  }),
  offer: one(listingOffer, {
    fields: [listingFieldSource.listingOfferId],
    references: [listingOffer.id],
  }),
}));
