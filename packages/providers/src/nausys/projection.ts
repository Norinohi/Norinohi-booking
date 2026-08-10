import type { z } from "zod";

import { parseNausysDate } from "../shared/dates";
import { toLocaleMap } from "../shared/international-text";
import { decimalStringToMinor } from "../shared/money";
import {
  canonicalCatalogueSchema,
  type CanonicalCatalogue,
  type ProviderRecordSet,
  type ProviderResourceType,
} from "../types";
import {
  restCharterBaseSchema,
  restCharterCompanySchema,
  restCountrySchema,
  restEquipmentCategorySchema,
  restEquipmentSchema,
  restLocationSchema,
  restRegionSchema,
  restYachtBuilderSchema,
  restYachtCategorySchema,
  restYachtModelSchema,
  restYachtSchema,
} from "./endpoints";

/**
 * Phase B: pure, total, and offline. No client, no database, no clock — the whole
 * NauSYS mapping story is a fixture in and a `CanonicalCatalogue` out.
 *
 * Every cross-reference degrades rather than throws. A 3000-yacht dump that lost
 * one model id is still 3000 yachts; a dump that aborts on the first surprise is
 * nothing at all.
 */

const PROVIDER_PREFIX = "nausys";

/**
 * NauSYS does not put a currency on `RestYacht`; the whole Adriatic fleet quotes in
 * EUR and `freeYachts` returns the authoritative currency per period anyway.
 * Vendor question Q-CURRENCY.
 */
const DEFAULT_CURRENCY = "EUR";

const TEXT_FIELDS: { kind: "description" | "notes" | "conditions"; keys: string[] }[] = [
  // Field naming is a vendor question (Q-YACHT-TEXT): the PDF calls these
  // "multilingual comments/notes" without naming the JSON keys, so each candidate
  // the recorded responses might use is accepted.
  { kind: "description", keys: ["commentary", "comment", "description", "yachtDescription"] },
  { kind: "notes", keys: ["notes", "note", "yachtNote", "internalNote"] },
  { kind: "conditions", keys: ["conditions", "charterConditions", "commercialConditions"] },
];

const LAYOUT_KEYS = ["yachtLayoutPictureUrl", "layoutPictureUrl", "layoutPictures"];

const FUEL_KEYS = ["fuelCapacity", "fuelTank"];
const WATER_KEYS = ["waterCapacity", "waterTank"];

export function projectNausysCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
  const countries = parseAll(records, "country", restCountrySchema);
  const regions = parseAll(records, "region", restRegionSchema);
  const locations = parseAll(records, "location", restLocationSchema);
  const companies = parseAll(records, "company", restCharterCompanySchema);
  const bases = parseAll(records, "base", restCharterBaseSchema);
  const builders = parseAll(records, "builder", restYachtBuilderSchema);
  const models = parseAll(records, "model", restYachtModelSchema);
  const categories = parseAll(records, "category", restYachtCategorySchema);
  const equipmentCategories = parseAll(records, "equipment_category", restEquipmentCategorySchema);
  const equipment = parseAll(records, "amenity", restEquipmentSchema);
  const yachts = parseAll(records, "yacht", restYachtSchema);

  const countryNameById = new Map(countries.map((item) => [String(item.id), name(item.name)]));
  const locationNameById = new Map(locations.map((item) => [String(item.id), name(item.name)]));
  const companyById = new Map(companies.map((item) => [String(item.id), item]));
  const modelById = new Map(models.map((item) => [String(item.id), item]));
  const knownEquipment = new Set(equipment.map((item) => String(item.id)));

  const projectedBases = bases.map((item) => {
    const locationId = String(item.locationId);
    const companyName = companyById.get(String(item.companyId))?.name ?? "";
    const locationName = locationNameById.get(locationId) ?? `Location ${locationId}`;

    return {
      externalId: String(item.id),
      externalLocationId: locationId,
      // `RestCharterBase` carries no name. Two companies operating out of one
      // location would otherwise resolve to the same base row, so the operator is
      // part of the name. Vendor question Q-BASE-NAME.
      name: text(item.name) ?? `${companyName} ${locationName}`.trim(),
      lat: numberOf(item.lat),
      lng: numberOf(item.lon),
      checkInTime: text(item.checkInTime),
      checkOutTime: text(item.checkOutTime),
    };
  });

  const listings = yachts
    .map((yacht) => projectYacht(yacht, { modelById, knownEquipment }))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return canonicalCatalogueSchema.parse({
    countries: countries.map((item) => ({
      externalId: String(item.id),
      // ISO-2 first: it is what makes the same country from two providers one row.
      code: text(item.code2) ?? text(item.code) ?? `${PROVIDER_PREFIX}-${item.id}`,
      name: name(item.name) ?? `Country ${item.id}`,
    })),
    regions: regions.map((item) => ({
      externalId: String(item.id),
      externalCountryId: String(item.countryId),
      name: name(item.name) ?? `Region ${item.id}`,
    })),
    locations: locations.map((item) => ({
      externalId: String(item.id),
      externalRegionId: String(item.regionId),
      name: name(item.name) ?? `Location ${item.id}`,
    })),
    bases: projectedBases,
    operators: companies.map((item) => ({
      externalId: String(item.id),
      name: item.name,
      // Vendor-id suffixed: two companies of the same name are two operators, and a
      // slug is the only unique key the operator table offers.
      slug: `${slugify(item.name)}-${item.id}`,
      country:
        item.countryId === undefined ? undefined : countryNameById.get(String(item.countryId)),
      city: text(item.city),
      email: text(item.email),
      phone: text(item.phone),
    })),
    builders: builders.map((item) => ({
      externalId: String(item.id),
      name: item.name,
      // Not id-suffixed: builders are a shared taxonomy, and one Beneteau row
      // serving every provider is the desired outcome.
      slug: slugify(item.name),
    })),
    models: models.map((item) => ({
      externalId: String(item.id),
      externalBuilderId:
        item.yachtBuilderId === undefined ? undefined : String(item.yachtBuilderId),
      name: item.name,
    })),
    categories: categories.map((item) => ({
      externalId: String(item.id),
      code: `${PROVIDER_PREFIX}:${item.id}`,
      name: name(item.name) ?? `Category ${item.id}`,
    })),
    amenityCategories: equipmentCategories.map((item) => ({
      externalId: String(item.id),
      name: name(item.name) ?? `Equipment category ${item.id}`,
    })),
    amenities: equipment.map((item) => ({
      externalId: String(item.id),
      externalAmenityCategoryId: String(item.categoryId),
      // The resolver splits this prefix back off to recover the vendor id, so the
      // shape is load-bearing, not cosmetic.
      code: `${PROVIDER_PREFIX}:${item.id}`,
      name: name(item.name) ?? `Equipment ${item.id}`,
    })),
    listings,
  });
}

/* ---------------------------------------------------------------- listings */

type RestYacht = z.infer<typeof restYachtSchema>;
type RestYachtModel = z.infer<typeof restYachtModelSchema>;

function projectYacht(
  yacht: RestYacht,
  context: { modelById: Map<string, RestYachtModel>; knownEquipment: Set<string> },
) {
  // A yacht with no base cannot become a listing: `listing.home_base_id` is NOT NULL
  // and there is nothing to guess from.
  if (yacht.baseId === undefined) return null;

  const externalId = String(yacht.id);
  const modelId = yacht.yachtModelId === undefined ? undefined : String(yacht.yachtModelId);
  const model = modelId === undefined ? undefined : context.modelById.get(modelId);
  const modelName = model?.name ?? "";
  const title = `${yacht.name} ${modelName}`.trim();
  const currency = currencyOf(yacht.currency);

  return {
    externalId,
    externalCompanyId: String(yacht.companyId),
    externalBaseId: String(yacht.baseId),
    // An unknown model or builder is left unset rather than fabricated; the writer
    // stores a listing with a null model, which is a gap, not a corruption.
    externalBuilderId:
      model?.yachtBuilderId === undefined ? undefined : String(model.yachtBuilderId),
    externalModelId: model === undefined ? undefined : modelId,
    externalCategoryId:
      yacht.yachtCategoryId === undefined ? undefined : String(yacht.yachtCategoryId),
    title,
    // Name plus vendor id: stable across re-syncs, and unique even for a fleet of
    // ten identically named boats.
    slug: `${slugify(title)}-${externalId}`,
    spec: {
      lengthM: numberOf(yacht.length) ?? numberOf(model?.loa) ?? 0,
      beamM: numberOf(yacht.beam) ?? numberOf(model?.beam),
      draftM: numberOf(yacht.draft) ?? numberOf(model?.draft),
      cabins: yacht.cabins ?? 0,
      berths: yacht.berths ?? 0,
      heads: yacht.wc ?? 0,
      yearBuilt: yacht.buildYear ?? 0,
      engines: intOf(yacht.engines),
      fuelCapacity: firstInt(yacht, FUEL_KEYS),
      waterCapacity: firstInt(yacht, WATER_KEYS),
    },
    media: mediaOf(yacht),
    amenities: (yacht.standardYachtEquipment ?? [])
      .map((item) => String(item.equipmentId))
      .filter((id) => context.knownEquipment.has(id)),
    texts: textsOf(yacht),
    checkinRules: (yacht.checkInPeriods ?? [])
      .map((period) => ({
        checkinWeekday: weekdayOf(period.checkInDay),
        checkoutWeekday: weekdayOf(period.checkOutDay),
        minNights: period.minimalDays === undefined ? undefined : positiveInt(period.minimalDays),
        maxNights: undefined,
      }))
      .filter(
        (rule) =>
          rule.checkinWeekday !== undefined ||
          rule.checkoutWeekday !== undefined ||
          rule.minNights !== undefined,
      ),
    oneWayRules: oneWayRulesOf(yacht),
    defaultCurrency: currency,
    securityDepositMinor: minorOf(yacht.deposit, currency),
    // Payment terms are per period and come from `freeYachts`, never from the
    // catalogue dump.
    paymentPolicy: undefined,
  };
}

function mediaOf(yacht: RestYacht) {
  const media: { externalUrl: string; role: "main" | "layout" | "gallery"; sortOrder: number }[] =
    [];
  const seen = new Set<string>();

  const push = (value: unknown, role: "main" | "layout" | "gallery") => {
    const url = text(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    media.push({ externalUrl: url, role, sortOrder: media.length });
  };

  push(yacht.mainPictureUrl, "main");
  for (const url of yacht.picturesURL ?? []) {
    push(url, "gallery");
  }
  for (const key of LAYOUT_KEYS) {
    const value = (yacht as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        push(
          typeof entry === "object" && entry !== null ? (entry as { url?: unknown }).url : entry,
          "layout",
        );
      }
      continue;
    }
    push(value, "layout");
  }

  return media;
}

function textsOf(yacht: RestYacht) {
  const texts: { kind: "description" | "notes" | "conditions"; locale: string; value: string }[] =
    [];

  for (const field of TEXT_FIELDS) {
    for (const key of field.keys) {
      const value = (yacht as Record<string, unknown>)[key];
      const locales = toLocaleMap(value);
      const entries = Object.entries(locales);
      if (entries.length === 0) continue;

      for (const [locale, item] of entries) {
        texts.push({ kind: field.kind, locale, value: item });
      }
      break;
    }
  }

  return texts;
}

function oneWayRulesOf(yacht: RestYacht) {
  const periods = (yacht as Record<string, unknown>).oneWayPeriods;
  if (!Array.isArray(periods)) return [];

  const rules: { startDate: string; endDate: string; isOneWay: boolean }[] = [];
  for (const period of periods) {
    if (typeof period !== "object" || period === null) continue;
    const record = period as Record<string, unknown>;
    const from = text(record.dateFrom) ?? text(record.periodFrom);
    const to = text(record.dateTo) ?? text(record.periodTo);
    if (!from || !to) continue;

    try {
      rules.push({
        startDate: parseNausysDate(from),
        endDate: parseNausysDate(to),
        isOneWay: record.oneWay === false ? false : true,
      });
    } catch {
      // A malformed period is dropped, not fatal: the rest of the yacht is fine.
    }
  }
  return rules;
}

/* ----------------------------------------------------------------- helpers */

function parseAll<TSchema extends z.ZodType>(
  records: ProviderRecordSet,
  resourceType: ProviderResourceType,
  schema: TSchema,
): z.infer<TSchema>[] {
  const parsed: z.infer<TSchema>[] = [];
  for (const entry of records.get(resourceType) ?? []) {
    const result = schema.safeParse(entry.payload);
    // One unparseable record is dropped rather than thrown: it is already retained
    // raw, and the run is worth more than the row.
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** English if the vendor has it, otherwise the first locale it does have. */
function name(value: unknown): string | undefined {
  const locales = toLocaleMap(value);
  return locales.en ?? Object.values(locales)[0];
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function intOf(value: unknown): number | undefined {
  const parsed = numberOf(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

function positiveInt(value: unknown): number | undefined {
  const parsed = intOf(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function firstInt(source: RestYacht, keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = intOf((source as Record<string, unknown>)[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function currencyOf(value: unknown): string {
  const code = text(value);
  return code && code.length === 3 ? code.toUpperCase() : DEFAULT_CURRENCY;
}

/**
 * Money is a decimal string and stays one until it is an integer of minor units.
 * A malformed amount drops the deposit rather than the yacht.
 */
function minorOf(value: unknown, currency: string): number | undefined {
  const amount = text(value);
  if (amount === undefined) return undefined;
  try {
    return decimalStringToMinor(amount, currency);
  } catch {
    return undefined;
  }
}

/**
 * NauSYS numbers check-in days 1..7 from Monday; our columns use the JavaScript
 * 0..6 from Sunday. Vendor question Q-WEEKDAY: the recorded responses only ever
 * show 6, which is Saturday under either reading.
 */
function weekdayOf(value: unknown): number | undefined {
  const day = intOf(value);
  if (day === undefined || day < 0 || day > 7) return undefined;
  return day % 7;
}
