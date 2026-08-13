import { createHash } from "node:crypto";

import { z } from "zod";

import { availability, catalogue } from "../mock/data";
import { ContractError, NotFoundError } from "../shared/errors";
import {
  canonicalCatalogueSchema,
  type CanonicalCatalogue,
  type ListingSummary,
  type ProviderRecordSet,
  type ProviderResourceType,
  type RawEntity,
} from "../types";

type Yacht = (typeof catalogue.yachts)[number];
type Slot = (typeof availability.slots)[number];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const listingIdFor = (yachtId: string) => `ylst_${slugify(yachtId)}`;

const first = <T>(items: T[], label: string) => {
  const item = items[0];
  if (item === undefined) {
    throw new Error(`Missing required fixture item: ${label}`);
  }
  return item;
};

export function sourceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function rawEntities(): RawEntity[] {
  return [
    ...catalogue.companies.map((payload) => ({
      resourceType: "company" as const,
      externalId: payload.id,
      payload,
    })),
    // Company-scoped so a failed fetch of one fleet cannot sweep away another's.
    ...catalogue.bases.map((payload) => ({
      resourceType: "base" as const,
      externalId: payload.id,
      scopeKey: payload.companyId,
      payload,
    })),
    ...catalogue.builders.map((payload) => ({
      resourceType: "builder" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.models.map((payload) => ({
      resourceType: "model" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.categories.map((payload) => ({
      resourceType: "category" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.amenities.map((payload) => ({
      resourceType: "amenity" as const,
      externalId: payload.id,
      payload,
    })),
    ...catalogue.yachts.map((payload) => ({
      resourceType: "yacht" as const,
      externalId: payload.id,
      scopeKey: payload.companyId,
      payload,
    })),
  ];
}

export function mapYachtToListing(yacht: Yacht): ListingSummary {
  const company = catalogue.companies.find((item) => item.id === yacht.companyId);
  const base = catalogue.bases.find((item) => item.id === yacht.baseId);
  const builder = catalogue.builders.find((item) => item.id === yacht.builderId);
  const model = catalogue.models.find((item) => item.id === yacht.modelId);
  const category = catalogue.categories.find((item) => item.id === yacht.categoryId);
  const amenities = catalogue.amenities.filter((item) => yacht.amenityIds.includes(item.id));

  if (!company || !base || !builder || !model || !category) {
    throw new Error(`Incomplete mock yacht fixture: ${yacht.id}`);
  }

  return {
    id: listingIdFor(yacht.id),
    slug: slugify(`${yacht.name}-${model.name}-${base.location}`),
    title: `${yacht.name} ${model.name}`,
    category: category.name,
    builder: builder.name,
    model: model.name,
    operator: company.name,
    base: {
      id: `base_${slugify(base.id)}`,
      name: base.name,
      location: base.location,
      region: base.region,
      country: base.country,
      lat: base.lat,
      lng: base.lng,
    },
    specs: {
      lengthM: yacht.lengthM,
      cabins: yacht.cabins,
      berths: yacht.berths,
      heads: yacht.heads,
      yearBuilt: yacht.yearBuilt,
    },
    rating: yacht.rating,
    reviewCount: yacht.reviewCount,
    mainImage: first(yacht.media, `${yacht.id} media`),
    gallery: yacht.media,
    amenities: amenities.map((item) => item.name),
    priceFrom: {
      amountMinor: yacht.priceFromMinor,
      currency: yacht.currency,
    },
    providerSourceId: `mock:${yacht.id}`,
  };
}

export function mapSlotToOffer(slot: Slot, guests: number) {
  const yacht = catalogue.yachts.find((item) => item.id === slot.yachtId);
  if (!yacht) {
    throw new Error(`Missing yacht for availability slot: ${slot.yachtId}`);
  }

  return {
    id: `offer_${slugify(`${slot.yachtId}-${slot.startDate}`)}`,
    listing: mapYachtToListing(yacht),
    provider: "mock" as const,
    checkIn: slot.startDate,
    checkOut: slot.endDate,
    nights: Math.round((Date.parse(slot.endDate) - Date.parse(slot.startDate)) / 86_400_000),
    guests,
    clientPrice: {
      amountMinor: slot.priceMinor,
      currency: slot.currency,
    },
    obligatoryExtras: availability.extras
      .filter((item) => item.obligatory)
      .map((item) => ({
        code: item.code,
        name: item.name,
        price: {
          amountMinor: item.priceMinor,
          currency: item.currency,
        },
      })),
    priceSourceHash: sourceHash(slot),
  };
}

export interface FixtureReference {
  yachtId: string;
  listingId: string;
  quoteId: string;
  checkIn: string;
  checkOut: string;
}

/**
 * Recovers the yacht and the charter period from a mock reservation handle.
 *
 * Every mock identifier is built by joining fixture ids with underscores
 * (`res_qte_mock_<yachtId>_<checkIn>`), so a reservation reference is enough to
 * reach the fixtures a real adapter would look up in the provider.
 */
export function resolveFixtureReference(reference: string): FixtureReference {
  const normalized = reference.replaceAll("_", "-");
  const yacht = catalogue.yachts.find((item) => normalized.includes(item.id));
  if (!yacht) {
    throw new NotFoundError(`No mock yacht behind reservation reference "${reference}"`);
  }

  const startDate = /\d{4}-\d{2}-\d{2}/.exec(normalized)?.[0];
  const slot = availability.slots.find(
    (item) =>
      item.yachtId === yacht.id && (startDate === undefined || item.startDate === startDate),
  );
  if (!slot) {
    throw new NotFoundError(`No mock period behind reservation reference "${reference}"`);
  }

  return {
    yachtId: yacht.id,
    listingId: listingIdFor(yacht.id),
    quoteId: reference.replace(/^(res|opt)_/, ""),
    checkIn: slot.startDate,
    checkOut: slot.endDate,
  };
}

/* ------------------------------------------------------ catalogue projection */

/*
 * The raw fixture shapes, mirroring what a real dump endpoint returns. Parsed
 * rather than trusted: a payload that has drifted must fail here, in the mapper,
 * and never reach a canonical DTO.
 */

const rawCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const rawBaseSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  country: z.string(),
  countryCode: z.string(),
  region: z.string(),
  location: z.string(),
  lat: z.number(),
  lng: z.number(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

const rawBuilderSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const rawModelSchema = z.object({
  id: z.string(),
  builderId: z.string().optional(),
  name: z.string(),
});

const rawCategorySchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string(),
});

const rawAmenitySchema = z.object({
  id: z.string(),
  category: z.string(),
  code: z.string().optional(),
  name: z.string(),
});

const rawYachtSchema = z.object({
  id: z.string(),
  name: z.string(),
  companyId: z.string(),
  baseId: z.string(),
  builderId: z.string().optional(),
  modelId: z.string().optional(),
  categoryId: z.string().optional(),
  yearBuilt: z.number().int(),
  lengthM: z.number(),
  cabins: z.number().int(),
  berths: z.number().int(),
  heads: z.number().int(),
  currency: z.string().length(3),
  securityDepositMinor: z.number().int().optional(),
  amenityIds: z.array(z.string()),
  media: z.array(z.string()),
  description: z.record(z.string(), z.string()).optional(),
  checkInPeriods: z
    .array(
      z.object({
        checkinWeekday: z.number().int().optional(),
        checkoutWeekday: z.number().int().optional(),
        minNights: z.number().int().optional(),
        maxNights: z.number().int().optional(),
      }),
    )
    .optional(),
  oneWayPeriods: z
    .array(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        isOneWay: z.boolean(),
      }),
    )
    .optional(),
});

function parseRecords<T>(
  records: ProviderRecordSet,
  resourceType: ProviderResourceType,
  schema: z.ZodType<T>,
): T[] {
  return (records.get(resourceType) ?? []).map((entry) => {
    const parsed = schema.safeParse(entry.payload);
    if (!parsed.success) {
      throw new ContractError(
        `Mock ${resourceType} "${entry.externalId}" has an unexpected shape`,
        {
          payload: { externalId: entry.externalId, issues: parsed.error.issues },
        },
      );
    }
    return parsed.data;
  });
}

/**
 * Phase B of the sync: pure, and a function of the accumulated records only.
 *
 * The mock fixture has no country/region/location dumps (the bases carry those
 * as names, the way several real feeds do), so the geography tree is derived here
 * with deterministic external ids the writer can upsert against.
 */
export function projectMockCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
  const companies = parseRecords(records, "company", rawCompanySchema);
  const bases = parseRecords(records, "base", rawBaseSchema);
  const builders = parseRecords(records, "builder", rawBuilderSchema);
  const models = parseRecords(records, "model", rawModelSchema);
  const categories = parseRecords(records, "category", rawCategorySchema);
  const amenities = parseRecords(records, "amenity", rawAmenitySchema);
  const yachts = parseRecords(records, "yacht", rawYachtSchema);

  const countries = new Map<string, { externalId: string; code: string; name: string }>();
  const regions = new Map<
    string,
    { externalId: string; externalCountryId: string; name: string }
  >();
  const locations = new Map<
    string,
    { externalId: string; externalRegionId: string; name: string }
  >();

  const projectedBases = bases.map((base) => {
    const countryId = `country-${base.countryCode.toLowerCase()}`;
    const regionId = `region-${base.countryCode.toLowerCase()}-${slugify(base.region)}`;
    const locationId = `${regionId}-${slugify(base.location)}`;

    countries.set(countryId, { externalId: countryId, code: base.countryCode, name: base.country });
    regions.set(regionId, {
      externalId: regionId,
      externalCountryId: countryId,
      name: base.region,
    });
    locations.set(locationId, {
      externalId: locationId,
      externalRegionId: regionId,
      name: base.location,
    });

    return {
      externalId: base.id,
      externalLocationId: locationId,
      name: base.name,
      lat: base.lat,
      lng: base.lng,
      checkInTime: base.checkInTime,
      checkOutTime: base.checkOutTime,
    };
  });

  const amenityCategories = new Map<string, { externalId: string; name: string }>();
  const projectedAmenities = amenities.map((item) => {
    const categoryId = `amc-${slugify(item.category)}`;
    amenityCategories.set(categoryId, { externalId: categoryId, name: item.category });

    return {
      externalId: item.id,
      externalAmenityCategoryId: categoryId,
      code: item.code,
      name: item.name,
    };
  });

  const baseById = new Map(bases.map((item) => [item.id, item]));
  const modelById = new Map(models.map((item) => [item.id, item]));

  const listings = yachts.map((yacht) => {
    const base = baseById.get(yacht.baseId);
    if (!base) {
      throw new ContractError(`Mock yacht "${yacht.id}" references unknown base "${yacht.baseId}"`);
    }
    const model = yacht.modelId === undefined ? undefined : modelById.get(yacht.modelId);
    const modelName = model?.name ?? "";

    return {
      externalId: yacht.id,
      externalCompanyId: yacht.companyId,
      externalBaseId: yacht.baseId,
      externalBuilderId: yacht.builderId,
      externalModelId: yacht.modelId,
      externalCategoryId: yacht.categoryId,
      title: `${yacht.name} ${modelName}`.trim(),
      slug: slugify(`${yacht.name}-${modelName}-${base.location}`),
      spec: {
        lengthM: yacht.lengthM,
        cabins: yacht.cabins,
        berths: yacht.berths,
        heads: yacht.heads,
        yearBuilt: yacht.yearBuilt,
      },
      media: yacht.media.map((externalUrl, index) => ({
        externalUrl,
        role: index === 0 ? ("main" as const) : ("gallery" as const),
        sortOrder: index,
      })),
      amenities: yacht.amenityIds,
      texts: Object.entries(yacht.description ?? {}).map(([locale, value]) => ({
        kind: "description" as const,
        locale,
        value,
      })),
      checkinRules: yacht.checkInPeriods ?? [],
      oneWayRules: yacht.oneWayPeriods ?? [],
      defaultCurrency: yacht.currency,
      securityDepositMinor: yacht.securityDepositMinor,
      // Matches what the mock quote prices; a real adapter reads it per yacht.
      paymentPolicy: { mode: "deposit" as const, depositPct: 0.5 },
    };
  });

  return canonicalCatalogueSchema.parse({
    countries: [...countries.values()],
    regions: [...regions.values()],
    locations: [...locations.values()],
    bases: projectedBases,
    operators: companies.map((company) => ({
      externalId: company.id,
      name: company.name,
      slug: slugify(company.name),
      email: company.email,
      phone: company.phone,
    })),
    builders: builders.map((item) => ({
      externalId: item.id,
      name: item.name,
      slug: slugify(item.name),
    })),
    models: models.map((item) => ({
      externalId: item.id,
      externalBuilderId: item.builderId,
      name: item.name,
    })),
    categories: categories.map((item) => ({
      externalId: item.id,
      code: item.code,
      name: item.name,
    })),
    amenityCategories: [...amenityCategories.values()],
    amenities: projectedAmenities,
    listings,
  });
}
