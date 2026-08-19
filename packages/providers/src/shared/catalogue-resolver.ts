import { amenity } from "@yacht-charter/db/schema/taxonomy";
import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import { builder, yachtCategory, yachtModel } from "@yacht-charter/db/schema/taxonomy";
import {
  listing,
  listingAmenity,
  listingMedia,
  listingSpecification,
} from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider, providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { chunked } from "./chunks";

import type { Database } from "../registry";
import type { ListingSummary, ProviderKey } from "../types";
import { NotFoundError } from "./errors";

export type ExternalListingRef = {
  externalYachtId: string;
  externalCompanyId: string | null;
  externalBaseId: string | null;
  listingSourceId: string;
};

/**
 * Translates between our public `ylst_` ids and a provider's own numeric ids.
 *
 * Every real adapter needs this: the marketplace never exposes a provider id, so
 * a quote or booking call has to walk `listing` → `listing_source` →
 * `provider_record` to recover the id the vendor expects. The mock sidesteps it
 * by matching fixture id suffixes, which is why only the real adapters take a db.
 */
export interface CatalogueResolver {
  /**
   * Our `provider` row id for this adapter. Exposed so every caller classifies a
   * missing provider row the same way; three private copies used to disagree.
   */
  providerId(): Promise<string>;
  toExternalListing(listingId: string): Promise<ExternalListingRef>;
  /**
   * The same mapping as `toExternalListing`, for many listings at once and yielding
   * only the yacht id.
   *
   * Exists because the seasonal price sweep prices the whole fleet in one pass and
   * needs to know which vendor yacht each of our listings is. Asking
   * `toExternalListing` per listing was a query per boat - tens of thousands of
   * sequential round-trips to answer one question about a set.
   *
   * A listing with no active source under this provider is absent from the map
   * rather than mapped to null: there is no id to give, and a caller that cannot
   * tell "not ours" from "ours but unnamed" would price the wrong boat.
   */
  toExternalYachtIds(listingIds: readonly string[]): Promise<Map<string, string>>;
  toListingId(externalYachtId: string): Promise<string | null>;
  /** Maps our amenity codes to the provider's service/equipment ids for extras. */
  toExternalAmenityIds(amenityCodes: string[]): Promise<string[]>;
  /**
   * Maps an ISO 3166-1 alpha-2 code to the provider's own country id, which is
   * what a booking's client payload carries. Null when the provider's catalogue
   * has no country for that code.
   */
  toExternalCountryId(isoCode: string): Promise<string | null>;
  /** Hydrates the summary that `AvailableOffer` requires but no provider returns. */
  loadListingSummary(listingId: string): Promise<ListingSummary | null>;
  /** Every external company id with an active record, for per-company sync sweeps. */
  listExternalCompanyIds(): Promise<string[]>;
  /**
   * Every company a yacht record is still filed under, whether or not the company
   * record itself is active.
   *
   * Deliberately not `listExternalCompanyIds`. Narrowing the import scope
   * deactivates the company record on the next run, so a company that has fallen
   * out of scope disappears from that list while its fleet stays active and its
   * listings stay published. This reads the fleet's own filing instead, which is
   * what a retire sweep has to address.
   */
  listYachtCompanyScopeKeys(): Promise<string[]>;
}

type CountryIndex = { byAlpha2: Map<string, string>; byAlpha3: Map<string, string> };

export function createCatalogueResolver(db: Database, providerKey: ProviderKey): CatalogueResolver {
  // The provider row is looked up once per resolver rather than per call: the
  // code → id mapping is immutable for the lifetime of a process.
  let providerIdPromise: Promise<string> | null = null;

  async function providerId(): Promise<string> {
    providerIdPromise ??= db
      .select({ id: provider.id })
      .from(provider)
      .where(eq(provider.code, providerKey))
      .limit(1)
      .then(([row]) => {
        if (!row) {
          throw new NotFoundError(`No provider row registered for "${providerKey}"`, {
            providerCode: providerKey,
          });
        }
        return row.id;
      });

    return providerIdPromise;
  }

  // Roughly 250 rows that no sync changes mid-process, and the alternative is a
  // query on every booking, so the whole index is loaded once and kept.
  let countryIndexPromise: Promise<CountryIndex> | null = null;

  async function countryIndex(): Promise<CountryIndex> {
    // Resolved before the memo is written: an await inside the `??=` would let two
    // concurrent callers both find it unset and both run the query.
    const owner = await providerId();

    countryIndexPromise ??= db
      .select({
        externalId: providerRecord.externalId,
        alpha2: sql<string | null>`${providerRawPayload.payload}->>'code2'`,
        alpha3: sql<string | null>`${providerRawPayload.payload}->>'code'`,
      })
      .from(providerRecord)
      .innerJoin(providerRawPayload, eq(providerRawPayload.id, providerRecord.rawPayloadId))
      .where(
        and(
          eq(providerRecord.providerId, owner),
          eq(providerRecord.resourceType, "country"),
          eq(providerRecord.active, true),
        ),
      )
      .then((rows) => {
        const byAlpha2 = new Map<string, string>();
        const byAlpha3 = new Map<string, string>();
        for (const row of rows) {
          // Kept apart rather than in one map: the alpha-3 fallback must never
          // answer a two-letter lookup that alpha-2 simply does not have.
          if (row.alpha2) byAlpha2.set(row.alpha2.trim().toUpperCase(), row.externalId);
          if (row.alpha3) byAlpha3.set(row.alpha3.trim().toUpperCase(), row.externalId);
        }
        return { byAlpha2, byAlpha3 };
      });

    return countryIndexPromise;
  }

  return {
    providerId,

    async toExternalListing(listingId) {
      const [row] = await db
        .select({
          externalYachtId: listingSource.externalYachtId,
          externalCompanyId: listingSource.externalCompanyId,
          externalBaseId: listingSource.externalBaseId,
          listingSourceId: listingSource.id,
        })
        .from(listingSource)
        .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
        .where(
          and(
            eq(listingSource.listingId, listingId),
            eq(providerRecord.providerId, await providerId()),
            eq(providerRecord.active, true),
          ),
        )
        .limit(1);

      if (!row) {
        throw new NotFoundError(`Listing ${listingId} has no active ${providerKey} source`, {
          providerCode: providerKey,
        });
      }

      return row;
    },

    async toExternalYachtIds(listingIds) {
      const found = new Map<string, string>();
      if (listingIds.length === 0) return found;

      const owner = await providerId();

      for (const chunk of chunked([...new Set(listingIds)])) {
        const rows = await db
          .select({
            listingId: listingSource.listingId,
            externalYachtId: listingSource.externalYachtId,
          })
          .from(listingSource)
          .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
          .where(
            and(
              inArray(listingSource.listingId, chunk),
              eq(providerRecord.providerId, owner),
              eq(providerRecord.active, true),
            ),
          );

        for (const row of rows) {
          if (row.listingId) found.set(row.listingId, row.externalYachtId);
        }
      }

      return found;
    },

    async toListingId(externalYachtId) {
      const [row] = await db
        .select({ listingId: listingSource.listingId })
        .from(listingSource)
        .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
        .where(
          and(
            eq(listingSource.externalYachtId, externalYachtId),
            eq(providerRecord.providerId, await providerId()),
          ),
        )
        .limit(1);

      return row?.listingId ?? null;
    },

    async toExternalAmenityIds(amenityCodes) {
      if (amenityCodes.length === 0) return [];

      const rows = await db
        .select({ code: amenity.code })
        .from(amenity)
        .where(inArray(amenity.code, amenityCodes));

      // Amenity codes are stored provider-prefixed ("nausys:3"); the vendor id is
      // the suffix. A code with no prefix belongs to another provider and is skipped
      // rather than passed through, which would send a foreign id to the vendor.
      const prefix = `${providerKey}:`;
      return rows
        .map((row) => row.code)
        .filter((code): code is string => Boolean(code?.startsWith(prefix)))
        .map((code) => code.slice(prefix.length));
    },

    async toExternalCountryId(isoCode) {
      const wanted = isoCode.trim().toUpperCase();
      if (!wanted) return null;

      const { byAlpha2, byAlpha3 } = await countryIndex();
      return byAlpha2.get(wanted) ?? byAlpha3.get(wanted) ?? null;
    },

    async loadListingSummary(listingId) {
      const [row] = await db
        .select({
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          defaultCurrency: listing.defaultCurrency,
          operatorName: operator.name,
          category: yachtCategory.name,
          builder: builder.name,
          model: yachtModel.name,
          baseId: base.id,
          baseName: base.name,
          baseLat: base.lat,
          baseLng: base.lng,
          locationName: location.name,
          regionName: region.name,
          countryName: country.name,
          lengthM: listingSpecification.lengthM,
          cabins: listingSpecification.cabins,
          berths: listingSpecification.berths,
          heads: listingSpecification.heads,
          yearBuilt: listingSpecification.yearBuilt,
          externalYachtId: listingSource.externalYachtId,
        })
        .from(listing)
        .innerJoin(operator, eq(operator.id, listing.operatorId))
        .innerJoin(base, eq(base.id, listing.homeBaseId))
        .leftJoin(location, eq(location.id, base.locationId))
        .leftJoin(region, eq(region.id, location.regionId))
        .leftJoin(country, eq(country.id, region.countryId))
        .leftJoin(yachtCategory, eq(yachtCategory.id, listing.categoryId))
        .leftJoin(builder, eq(builder.id, listing.builderId))
        .leftJoin(yachtModel, eq(yachtModel.id, listing.modelId))
        .leftJoin(listingSpecification, eq(listingSpecification.listingId, listing.id))
        .leftJoin(listingSource, eq(listingSource.id, listing.primarySourceId))
        .where(eq(listing.id, listingId))
        .limit(1);

      if (!row) return null;

      const [media, amenities] = await Promise.all([
        db
          .select({ url: listingMedia.externalUrl, role: listingMedia.role })
          .from(listingMedia)
          .where(eq(listingMedia.listingId, listingId))
          .orderBy(asc(listingMedia.sortOrder)),
        db
          .select({ name: amenity.name })
          .from(listingAmenity)
          .innerJoin(amenity, eq(amenity.id, listingAmenity.amenityId))
          .where(eq(listingAmenity.listingId, listingId)),
      ]);

      const gallery = media.filter((item) => item.role !== "layout").map((item) => item.url);
      const mainImage = media.find((item) => item.role === "main")?.url ?? gallery[0];
      if (!mainImage) return null;

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        category: row.category ?? "",
        builder: row.builder ?? "",
        model: row.model ?? "",
        operator: row.operatorName,
        base: {
          id: row.baseId,
          name: row.baseName,
          location: row.locationName ?? "",
          region: row.regionName ?? "",
          country: row.countryName ?? "",
          lat: Number(row.baseLat ?? 0),
          lng: Number(row.baseLng ?? 0),
        },
        specs: {
          lengthM: Number(row.lengthM ?? 0),
          cabins: row.cabins ?? 0,
          berths: row.berths ?? 0,
          heads: row.heads ?? 0,
          yearBuilt: row.yearBuilt ?? 0,
        },
        // Ratings live in the review read model, not the catalogue; the caller
        // overlays them when it has them.
        rating: 0,
        reviewCount: 0,
        mainImage,
        gallery,
        amenities: amenities.map((item) => item.name),
        priceFrom: { amountMinor: 0, currency: row.defaultCurrency ?? "EUR" },
        providerSourceId: `${providerKey}:${row.externalYachtId ?? ""}`,
      } satisfies ListingSummary;
    },

    async listExternalCompanyIds() {
      const rows = await db
        .selectDistinct({ externalId: providerRecord.externalId })
        .from(providerRecord)
        .where(
          and(
            eq(providerRecord.providerId, await providerId()),
            eq(providerRecord.resourceType, "company"),
            eq(providerRecord.active, true),
          ),
        );

      return rows.map((row) => row.externalId);
    },

    async listYachtCompanyScopeKeys() {
      const rows = await db
        .selectDistinct({ scopeKey: providerRecord.scopeKey })
        .from(providerRecord)
        .where(
          and(
            eq(providerRecord.providerId, await providerId()),
            eq(providerRecord.resourceType, "yacht"),
            eq(providerRecord.active, true),
            isNotNull(providerRecord.scopeKey),
          ),
        );

      return rows.flatMap((row) => (row.scopeKey === null ? [] : [row.scopeKey]));
    },
  };
}
