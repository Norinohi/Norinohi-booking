/*
 * Composes `listing` and `listing_specification` out of the offers beneath them.
 *
 * The database half of `canonical-listing.ts`, which holds the decision itself and is where
 * the reasoning lives. This reads the candidates, asks it who wins each field group, writes
 * the answer, and records it in `listing_field_source` so a reviewer can see what was chosen.
 *
 * The catalogue writer no longer touches either table. That is the whole point: with two
 * providers on one hull, whoever synced last used to win, so a merged boat's title and cabin
 * count changed nightly and neither value was anyone's decision.
 */
import { listing, listingSpecification } from "@yacht-charter/db/schema/listing";
import {
  listingField,
  listingFieldSource,
  listingOffer,
  listingOfferSpecification,
} from "@yacht-charter/db/schema/listing-offer";
import { provider } from "@yacht-charter/db/schema/provider";
import { newId } from "@yacht-charter/db/schema/_shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../registry";
import { chunked, ID_CHUNK, ROW_CHUNK } from "../shared/chunks";
import {
  countStated,
  type FieldGroup,
  type OfferFieldCandidate,
  resolveFields,
} from "./canonical-listing";

type OfferRow = {
  offerId: string;
  listingId: string;
  providerCode: string;
  title: string | null;
  operatorId: string | null;
  homeBaseId: string | null;
  builderId: string | null;
  modelId: string | null;
  categoryId: string | null;
  petsAllowed: boolean;
  defaultCurrency: string | null;
  crewType: string | null;
  securityDepositMinor: number | null;
  securityDepositCurrency: string | null;
  depositInsuranceIncluded: boolean;
  providerRating: string | null;
  providerReviewCount: number | null;
  mediaCount: number;
  descriptionCount: number;
  spec: SpecRow | null;
};

type SpecRow = {
  lengthM: string | null;
  beamM: string | null;
  draftM: string | null;
  yearBuilt: number | null;
  cabins: number | null;
  berths: number | null;
  heads: number | null;
  showers: number | null;
  engines: number | null;
  enginePower: string | null;
  fuelType: string | null;
  fuelCapacity: number | null;
  waterCapacity: number | null;
  propulsionType: string | null;
  steeringType: string | null;
  sailType: string | null;
};

const SPEC_COLUMNS: readonly (keyof SpecRow)[] = [
  "lengthM",
  "beamM",
  "draftM",
  "yearBuilt",
  "cabins",
  "berths",
  "heads",
  "showers",
  "engines",
  "enginePower",
  "fuelType",
  "fuelCapacity",
  "waterCapacity",
  "propulsionType",
  "steeringType",
  "sailType",
];

/**
 * Rewrites the canonical row of every listing named, from its offers.
 *
 * A listing with no active offer is left exactly as it is. It has nothing to be composed from,
 * and blanking a card because a vendor's dump was short one night would be worse than keeping
 * yesterday's; the orphan sweep is what withdraws a listing nobody sells any more.
 */
export async function resolveCanonicalListings(
  db: Database,
  listingIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(listingIds)];
  if (ids.length === 0) return 0;

  let resolved = 0;
  for (const chunk of chunked(ids, ID_CHUNK)) {
    const [offers, overrides] = await Promise.all([
      loadOffers(db, chunk),
      loadLockedOverrides(db, chunk),
    ]);

    const updates: (typeof listing.$inferInsert)[] = [];
    const specs: (typeof listingSpecification.$inferInsert)[] = [];
    const decisions: (typeof listingFieldSource.$inferInsert)[] = [];

    for (const [listingId, candidates] of groupByListing(offers)) {
      if (candidates.length === 0) continue;

      const winners = resolveFields(
        candidates.map(toFieldCandidate),
        overrides.get(listingId) ?? new Map(),
      );
      const byId = new Map(candidates.map((offer) => [offer.offerId, offer]));
      const winner = (group: FieldGroup) => {
        const id = winners.get(group);
        return id === undefined ? candidates[0] : (byId.get(id) ?? candidates[0]);
      };

      const title = winner("title");
      const spec = winner("spec");
      const taxonomy = winner("taxonomy");
      const operator = winner("operator");
      const base = winner("home_base");
      const pets = winner("pets");

      /*
       * `operator_id` and `home_base_id` are NOT NULL, so a winner that carries neither is not
       * a winner for those: the listing keeps what it has rather than failing the whole batch
       * over one vendor's thin record.
       */
      if (!title || !operator?.operatorId || !base?.homeBaseId) continue;

      updates.push({
        id: listingId,
        slug: "",
        title: title.title ?? "",
        operatorId: operator.operatorId,
        homeBaseId: base.homeBaseId,
        builderId: taxonomy?.builderId ?? null,
        modelId: taxonomy?.modelId ?? null,
        categoryId: taxonomy?.categoryId ?? null,
        petsAllowed: pets?.petsAllowed ?? false,
        /* Commercial terms belong to an offer; the listing keeps the winner's as a display default. */
        defaultCurrency: title.defaultCurrency,
        crewType: title.crewType,
        securityDepositMinor: title.securityDepositMinor,
        securityDepositCurrency: title.securityDepositCurrency,
        depositInsuranceIncluded: title.depositInsuranceIncluded,
        providerRating: title.providerRating,
        providerReviewCount: title.providerReviewCount,
        freshnessAt: new Date(),
      });

      if (spec?.spec) {
        specs.push({ id: newId("lspec"), listingId, ...spec.spec });
      }

      for (const [group, offerId] of winners) {
        decisions.push({ id: newId("lfsr"), listingId, field: group, listingOfferId: offerId });
      }

      resolved += 1;
    }

    await writeListings(db, updates);
    await writeSpecifications(db, specs);
    await writeDecisions(db, decisions);
  }

  return resolved;
}

async function loadOffers(db: Database, listingIds: readonly string[]): Promise<OfferRow[]> {
  const rows = await db
    .select({
      offerId: listingOffer.id,
      listingId: listingOffer.listingId,
      providerCode: provider.code,
      title: listingOffer.title,
      operatorId: listingOffer.operatorId,
      homeBaseId: listingOffer.homeBaseId,
      builderId: listingOffer.builderId,
      modelId: listingOffer.modelId,
      categoryId: listingOffer.categoryId,
      petsAllowed: listingOffer.petsAllowed,
      defaultCurrency: listingOffer.defaultCurrency,
      crewType: listingOffer.crewType,
      securityDepositMinor: listingOffer.securityDepositMinor,
      securityDepositCurrency: listingOffer.securityDepositCurrency,
      depositInsuranceIncluded: listingOffer.depositInsuranceIncluded,
      providerRating: listingOffer.providerRating,
      providerReviewCount: listingOffer.providerReviewCount,
      /* Counted rather than fetched: completeness is all the resolver needs from them. */
      mediaCount: sql<number>`(
        select count(*) from listing_media m where m.listing_offer_id = ${listingOffer.id}
      )`.mapWith(Number),
      descriptionCount: sql<number>`(
        select count(*) from listing_text t where t.listing_offer_id = ${listingOffer.id}
      )`.mapWith(Number),
      spec: {
        lengthM: listingOfferSpecification.lengthM,
        beamM: listingOfferSpecification.beamM,
        draftM: listingOfferSpecification.draftM,
        yearBuilt: listingOfferSpecification.yearBuilt,
        cabins: listingOfferSpecification.cabins,
        berths: listingOfferSpecification.berths,
        heads: listingOfferSpecification.heads,
        showers: listingOfferSpecification.showers,
        engines: listingOfferSpecification.engines,
        enginePower: listingOfferSpecification.enginePower,
        fuelType: listingOfferSpecification.fuelType,
        fuelCapacity: listingOfferSpecification.fuelCapacity,
        waterCapacity: listingOfferSpecification.waterCapacity,
        propulsionType: listingOfferSpecification.propulsionType,
        steeringType: listingOfferSpecification.steeringType,
        sailType: listingOfferSpecification.sailType,
      },
    })
    .from(listingOffer)
    .innerJoin(provider, eq(provider.id, listingOffer.providerId))
    .leftJoin(
      listingOfferSpecification,
      eq(listingOfferSpecification.listingOfferId, listingOffer.id),
    )
    .where(and(inArray(listingOffer.listingId, [...listingIds]), eq(listingOffer.status, "active")))
    .orderBy(listingOffer.id);

  return rows;
}

/** Only the locked rows: everything else is this resolver's own output from the last run. */
async function loadLockedOverrides(
  db: Database,
  listingIds: readonly string[],
): Promise<Map<string, Map<FieldGroup, string>>> {
  const rows = await db
    .select({
      listingId: listingFieldSource.listingId,
      field: listingFieldSource.field,
      listingOfferId: listingFieldSource.listingOfferId,
    })
    .from(listingFieldSource)
    .where(
      and(
        inArray(listingFieldSource.listingId, [...listingIds]),
        eq(listingFieldSource.locked, true),
      ),
    );

  const byListing = new Map<string, Map<FieldGroup, string>>();
  for (const row of rows) {
    const groups = byListing.get(row.listingId) ?? new Map<FieldGroup, string>();
    groups.set(row.field, row.listingOfferId);
    byListing.set(row.listingId, groups);
  }
  return byListing;
}

function groupByListing(offers: readonly OfferRow[]): Map<string, OfferRow[]> {
  const byListing = new Map<string, OfferRow[]>();
  for (const offer of offers) {
    const bucket = byListing.get(offer.listingId) ?? [];
    bucket.push(offer);
    byListing.set(offer.listingId, bucket);
  }
  return byListing;
}

function toFieldCandidate(offer: OfferRow): OfferFieldCandidate {
  return {
    offerId: offer.offerId,
    providerCode: offer.providerCode,
    completeness: {
      title: countStated([offer.title]),
      spec: offer.spec ? countStated(SPEC_COLUMNS.map((column) => offer.spec?.[column])) : 0,
      taxonomy: countStated([offer.builderId, offer.modelId, offer.categoryId]),
      operator: countStated([offer.operatorId]),
      home_base: countStated([offer.homeBaseId]),
      pets: 1,
      media: offer.mediaCount,
      description: offer.descriptionCount,
    },
  };
}

/**
 * `slug` and `status` are read back and carried through untouched: both are NOT NULL, neither
 * is the resolver's to decide, and an `ON CONFLICT DO UPDATE` has to name every column of the
 * row it inserts. Mirrors what the listing writer did before it stopped writing this table.
 */
async function writeListings(
  db: Database,
  updates: readonly (typeof listing.$inferInsert)[],
): Promise<void> {
  if (updates.length === 0) return;

  const stored = await db
    .select({ id: listing.id, slug: listing.slug, status: listing.status })
    .from(listing)
    .where(
      inArray(
        listing.id,
        updates.map((row) => row.id).filter((id): id is string => id !== undefined),
      ),
    );
  const identities = new Map(stored.map((row) => [row.id, row]));

  const values = updates.flatMap((row) => {
    const identity = row.id === undefined ? undefined : identities.get(row.id);
    return identity ? [{ ...row, slug: identity.slug, status: identity.status }] : [];
  });

  for (const chunk of chunked(values, ROW_CHUNK)) {
    await db
      .insert(listing)
      .values(chunk)
      .onConflictDoUpdate({
        target: listing.id,
        set: {
          title: sql`excluded.title`,
          operatorId: sql`excluded.operator_id`,
          homeBaseId: sql`excluded.home_base_id`,
          builderId: sql`excluded.builder_id`,
          modelId: sql`excluded.model_id`,
          categoryId: sql`excluded.category_id`,
          petsAllowed: sql`excluded.pets_allowed`,
          defaultCurrency: sql`excluded.default_currency`,
          crewType: sql`excluded.crew_type`,
          securityDepositMinor: sql`excluded.security_deposit_minor`,
          securityDepositCurrency: sql`excluded.security_deposit_currency`,
          depositInsuranceIncluded: sql`excluded.deposit_insurance_included`,
          providerRating: sql`excluded.provider_rating`,
          providerReviewCount: sql`excluded.provider_review_count`,
          freshnessAt: sql`excluded.freshness_at`,
          updatedAt: sql`now()`,
        },
      });
  }
}

async function writeSpecifications(
  db: Database,
  specs: readonly (typeof listingSpecification.$inferInsert)[],
): Promise<void> {
  for (const chunk of chunked([...specs], ROW_CHUNK)) {
    await db
      .insert(listingSpecification)
      .values(chunk)
      .onConflictDoUpdate({
        target: listingSpecification.listingId,
        set: Object.fromEntries(
          SPEC_COLUMNS.map((column) => [
            column,
            sql.raw(`excluded.${listingSpecification[column].name}`),
          ]),
        ),
      });
  }
}

/**
 * The unlocked decisions, rewritten every run so the admin screen can show which vendor each
 * part of a merged card came from. A locked row is an admin's and is never overwritten.
 */
async function writeDecisions(
  db: Database,
  decisions: readonly (typeof listingFieldSource.$inferInsert)[],
): Promise<void> {
  for (const chunk of chunked([...decisions], ROW_CHUNK)) {
    await db
      .insert(listingFieldSource)
      .values(chunk)
      .onConflictDoUpdate({
        target: [listingFieldSource.listingId, listingFieldSource.field],
        set: { listingOfferId: sql`excluded.listing_offer_id`, updatedAt: sql`now()` },
        setWhere: eq(listingFieldSource.locked, false),
      });
  }
}

/** Exported for the enum's own sake, so a caller can iterate the groups the table stores. */
export const LISTING_FIELDS = listingField.enumValues;
