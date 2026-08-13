import type { z } from "zod";

import type { JsonField } from "../shared/json";
import { stripHtml } from "../shared/html-text";
import { decimalStringToMinor } from "../shared/money";
import {
  currencyOf,
  idOf,
  intOf,
  numberOf,
  parseAll,
  positiveInt,
  slugify,
  text,
} from "../shared/projection-helpers";
import {
  canonicalCatalogueSchema,
  type CanonicalCatalogue,
  type ProviderRecordSet,
} from "../types";
import {
  restBaseSchema,
  restCompanySchema,
  restCountrySchema,
  restEquipmentSchema,
  restSailingAreaSchema,
  restShipyardSchema,
  restWorldRegionSchema,
  restYachtSchema,
  restYachtTypeSchema,
} from "./endpoints";

/**
 * Phase B: pure, total, and offline. No client, no database, no clock: fixtures
 * in, a `CanonicalCatalogue` out.
 *
 * Every cross-reference degrades rather than throws, and every unparseable record
 * is dropped alone. A fleet that lost one shipyard id is still a fleet.
 */

const PROVIDER_PREFIX = "booking_manager";

/**
 * Booking Manager returns one language per request and the catalogue sync asks
 * for none, so every string here is the vendor's default. Recorded responses are
 * English; flagged as an assumption rather than something the vendor states.
 */
const CATALOGUE_LOCALE = "en";

/** Used only when a yacht names equipment the `/equipment` dump does not categorise. */
const UNCATEGORISED_AMENITY_CATEGORY = { externalId: "uncategorised", name: "Equipment" };

/**
 * `descriptions[]` is category-keyed free text with no kind of its own, so the
 * category name is the only signal. First match wins; anything unmatched is the
 * marketing description.
 */
const TEXT_KIND_RULES: { pattern: RegExp; kind: "conditions" | "one_way_note" | "notes" }[] = [
  { pattern: /one[\s_-]?way/i, kind: "one_way_note" },
  { pattern: /term|condition|payment|policy|cancellation/i, kind: "conditions" },
  { pattern: /note|remark|important|check[\s_-]?in|extra/i, kind: "notes" },
];

type TextKind = "description" | "notes" | "conditions" | "one_way_note";

export function projectBookingManagerCatalogue(records: ProviderRecordSet): CanonicalCatalogue {
  const countries = parseAll(records, "country", restCountrySchema);
  const worldRegions = parseAll(records, "region", restWorldRegionSchema);
  const sailingAreas = parseAll(records, "location", restSailingAreaSchema);
  const equipment = parseAll(records, "equipment_category", restEquipmentSchema);
  const shipyards = parseAll(records, "builder", restShipyardSchema);
  const yachtTypes = parseAll(records, "category", restYachtTypeSchema);
  const companies = parseAll(records, "company", restCompanySchema);
  const bases = parseAll(records, "base", restBaseSchema);
  const yachts = parseAll(records, "yacht", restYachtSchema);

  const countryById = new Map(countries.map((item) => [String(item.id), item]));
  const worldRegionNameById = new Map(
    worldRegions.map((item) => [String(item.id), text(item.name)]),
  );
  const sailingAreaNameById = new Map(
    sailingAreas.map((item) => [String(item.id), text(item.name)]),
  );
  const knownShipyards = new Set(shipyards.map((item) => String(item.id)));
  const knownEquipment = new Set(equipment.map((item) => String(item.id)));

  const geography = projectGeography(bases, {
    countryById,
    worldRegionNameById,
    sailingAreaNameById,
  });

  const categoryIdByKind = new Map(
    yachtTypes
      .map((item) => text(item.name))
      .filter((name): name is string => name !== undefined)
      .map((name) => [name.toLowerCase(), name]),
  );

  const amenities = projectAmenities(equipment, yachts);
  const models = projectModels(yachts, knownShipyards);
  const baseTimes = baseTimesOf(yachts);

  const listings = yachts
    .map((yacht) => projectYacht(yacht, { categoryIdByKind, knownEquipment, knownShipyards }))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return canonicalCatalogueSchema.parse({
    countries: countries.map((item) => ({
      externalId: String(item.id),
      // ISO-2 first: it is what makes the same country from two providers one row.
      code: countryCodeOf(item),
      name: text(item.name) ?? text(item.long) ?? text(item.longName) ?? `Country ${item.id}`,
    })),
    regions: geography.regions,
    locations: geography.locations,
    bases: geography.bases.map((item) => ({
      ...item,
      // Booking Manager files check-in and check-out on the yacht, but they are the
      // base's own wall-clock times. Kept verbatim as strings: converting them to an
      // instant would make a 17:00 handover in Split render as 15:00 to a UTC reader.
      checkInTime: baseTimes.get(item.externalId)?.checkInTime,
      checkOutTime: baseTimes.get(item.externalId)?.checkOutTime,
    })),
    operators: companies.map((item) => {
      const name = text(item.name) ?? `Company ${item.id}`;
      return {
        externalId: String(item.id),
        name,
        // Provider-namespaced and vendor-id suffixed: two companies of the same
        // name are two operators, and a slug is the only unique key the operator
        // table offers. The provider prefix matters because the two vendors number
        // their companies independently, so `sunsail-1234` from each would
        // otherwise be one row that each sync overwrote with its own details.
        slug: `${PROVIDER_PREFIX}-${slugify(name)}-${item.id}`,
        country: text(item.country),
        city: text(item.city),
        email: text(item.email),
        phone: text(item.telephone) ?? text(item.mobile) ?? text(item.telephone2),
      };
    }),
    builders: shipyards.map((item) => {
      const name = text(item.name) ?? text(item.shortName) ?? `Shipyard ${item.id}`;
      return {
        externalId: String(item.id),
        name,
        // Not id-suffixed: builders are a shared taxonomy, and one Beneteau row
        // serving every provider is the desired outcome.
        slug: slugify(name),
      };
    }),
    models,
    categories: [...categoryIdByKind.values()].map((name) => ({
      externalId: name,
      code: `${PROVIDER_PREFIX}:${slugify(name)}`,
      name,
    })),
    amenityCategories: amenities.categories,
    amenities: amenities.amenities,
    listings,
  });
}

/* --------------------------------------------------------------- geography */

type RestBase = z.infer<typeof restBaseSchema>;
type RestCountry = z.infer<typeof restCountrySchema>;
type RestYacht = z.infer<typeof restYachtSchema>;

/**
 * Booking Manager's geography is not our geography.
 *
 * Ours is country → region → location → base. The vendor's is world region →
 * country → base, with sailing areas hanging off bases as an unrelated many-to-many
 * and no country of their own. So the chain is rebuilt from the bases outward: a
 * base names its country and its sailing areas, which is enough to place it.
 *
 * A country therefore gets exactly one region, named after its world region. That
 * loses the vendor's grouping of countries under a world region, which our model
 * has no room for anyway, and it keeps `region.country_id` (NOT NULL) satisfiable.
 * Regions and locations are emitted only where a base actually needs them, so an
 * unvisited country does not leave an empty branch behind.
 */
function projectGeography(
  bases: RestBase[],
  context: {
    countryById: Map<string, RestCountry>;
    worldRegionNameById: Map<string, string | undefined>;
    sailingAreaNameById: Map<string, string | undefined>;
  },
) {
  const regions = new Map<
    string,
    { externalId: string; externalCountryId: string; name: string }
  >();
  const locations = new Map<
    string,
    { externalId: string; externalRegionId: string; name: string }
  >();
  const projectedBases: {
    externalId: string;
    externalLocationId: string;
    name: string;
    lat?: number;
    lng?: number;
  }[] = [];

  for (const item of bases) {
    const countryId = idOf(item.countryId);
    // No country means no region and no location, and `base.location_id` is NOT
    // NULL. The base is dropped rather than filed under an invented place.
    if (countryId === null) continue;

    const country = context.countryById.get(countryId);
    const countryName = text(country?.name) ?? text(country?.long) ?? `Country ${countryId}`;
    const regionExternalId = `region:${countryId}`;
    const worldRegionId = idOf(country?.worldRegion);
    regions.set(regionExternalId, {
      externalId: regionExternalId,
      externalCountryId: countryId,
      name:
        (worldRegionId === null ? undefined : context.worldRegionNameById.get(worldRegionId)) ??
        countryName,
    });

    // A sailing area spans countries (the Adriatic is Croatian and Montenegrin), so
    // it is split per country: one canonical location may only sit in one region.
    const sailingAreaId = (item.sailingAreas ?? [])
      .map((value) => idOf(value))
      .find((value): value is string => value !== null && context.sailingAreaNameById.has(value));

    const locationExternalId =
      sailingAreaId === undefined
        ? `location:${countryId}`
        : `location:${sailingAreaId}:${countryId}`;
    locations.set(locationExternalId, {
      externalId: locationExternalId,
      externalRegionId: regionExternalId,
      name:
        (sailingAreaId === undefined
          ? undefined
          : context.sailingAreaNameById.get(sailingAreaId)) ?? countryName,
    });

    projectedBases.push({
      externalId: String(item.id),
      externalLocationId: locationExternalId,
      name: text(item.name) ?? text(item.city) ?? `Base ${item.id}`,
      // Declared as strings in the spec, so they are parsed here rather than trusted.
      lat: coordinateOf(item.latitude),
      lng: coordinateOf(item.longitude),
    });
  }

  return {
    regions: [...regions.values()],
    locations: [...locations.values()],
    bases: projectedBases,
  };
}

/** The vendor's only statement of a base's turnaround times is on the boats moored there. */
function baseTimesOf(yachts: RestYacht[]) {
  const times = new Map<string, { checkInTime?: string; checkOutTime?: string }>();

  for (const yacht of yachts) {
    const baseId = idOf(yacht.homeBaseId);
    if (baseId === null) continue;

    const existing = times.get(baseId) ?? {};
    times.set(baseId, {
      checkInTime: existing.checkInTime ?? clockTime(yacht.defaultCheckInTime),
      checkOutTime: existing.checkOutTime ?? clockTime(yacht.defaultCheckOutTime),
    });
  }

  return times;
}

/* ---------------------------------------------------------------- taxonomy */

/**
 * Amenity categories exist nowhere in the vendor's reference data: `/equipment` is
 * a flat id/name list, and the only mention of a category is `categoryName` inside
 * a yacht's `equipmentRaw`. So the categories are derived from the fleet and the
 * amenities filed against them by id, falling back to a name match because the raw
 * inventory rows may not share the `/equipment` id space (Q-BM-EQUIPMENT-ID).
 */
function projectAmenities(equipment: z.infer<typeof restEquipmentSchema>[], yachts: RestYacht[]) {
  const categoryNames = new Map<string, string>();
  const categoryByKey = new Map<string, string>();

  for (const yacht of yachts) {
    for (const item of yacht.equipmentRaw ?? []) {
      const categoryName = text(item.categoryName);
      if (categoryName === undefined) continue;

      const categoryId = slugify(categoryName);
      if (categoryId === "") continue;
      categoryNames.set(categoryId, categoryName);

      const id = idOf(item.id);
      if (id !== null) categoryByKey.set(`id:${id}`, categoryId);
      const name = text(item.name);
      if (name !== undefined) categoryByKey.set(`name:${name.toLowerCase()}`, categoryId);
    }
  }

  let needsFallback = false;
  const amenities = equipment.map((item) => {
    const name = text(item.name) ?? `Equipment ${item.id}`;
    const categoryId =
      categoryByKey.get(`id:${item.id}`) ?? categoryByKey.get(`name:${name.toLowerCase()}`);
    if (categoryId === undefined) needsFallback = true;

    return {
      externalId: String(item.id),
      externalAmenityCategoryId: categoryId ?? UNCATEGORISED_AMENITY_CATEGORY.externalId,
      // The resolver splits this prefix back off to recover the vendor id, so the
      // shape is load-bearing, not cosmetic.
      code: `${PROVIDER_PREFIX}:${item.id}`,
      name,
    };
  });

  const categories = [...categoryNames.entries()].map(([externalId, name]) => ({
    externalId,
    name,
  }));
  if (needsFallback) categories.push({ ...UNCATEGORISED_AMENITY_CATEGORY });

  return { categories, amenities };
}

/**
 * There is no models endpoint, so the model list is whatever the fleet names. The
 * builder comes from the yacht rather than the model for the same reason:
 * `shipyardId` is a yacht field here.
 */
function projectModels(yachts: RestYacht[], knownShipyards: Set<string>) {
  const models = new Map<
    string,
    { externalId: string; externalBuilderId?: string; name: string }
  >();

  for (const yacht of yachts) {
    const key = modelKeyOf(yacht);
    if (key === undefined || models.has(key.externalId)) continue;

    const shipyardId = idOf(yacht.shipyardId);
    models.set(key.externalId, {
      externalId: key.externalId,
      externalBuilderId:
        shipyardId !== null && knownShipyards.has(shipyardId) ? shipyardId : undefined,
      name: key.name,
    });
  }

  return [...models.values()];
}

/** `modelId` is optional, so a model named but unnumbered is keyed by its name. */
function modelKeyOf(yacht: RestYacht): { externalId: string; name: string } | undefined {
  const name = text(yacht.model);
  if (name === undefined) return undefined;

  const id = idOf(yacht.modelId);
  return { externalId: id ?? `model:${slugify(name)}`, name };
}

/* ---------------------------------------------------------------- listings */

function projectYacht(
  yacht: RestYacht,
  context: {
    categoryIdByKind: Map<string, string>;
    knownEquipment: Set<string>;
    knownShipyards: Set<string>;
  },
) {
  const companyId = idOf(yacht.companyId);
  const baseId = idOf(yacht.homeBaseId);
  // `listing.operator_id` and `listing.home_base_id` are both NOT NULL and there is
  // nothing to guess from.
  if (companyId === null || baseId === null) return null;

  const externalId = String(yacht.id);
  const model = modelKeyOf(yacht);
  const title = titleOf(yacht, model?.name);
  const currency = currencyOf(yacht.currency);
  const shipyardId = idOf(yacht.shipyardId);
  const kind = text(yacht.kind)?.toLowerCase();

  return {
    externalId,
    externalCompanyId: companyId,
    externalBaseId: baseId,
    externalBuilderId:
      shipyardId !== null && context.knownShipyards.has(shipyardId) ? shipyardId : undefined,
    externalModelId: model?.externalId,
    // An unknown kind is left unset rather than minted as a new category: the
    // category list is `/yachtTypes`, and anything else is a typo or a drift.
    externalCategoryId: kind === undefined ? undefined : context.categoryIdByKind.get(kind),
    title,
    slug: `${slugify(title)}-${externalId}`,
    spec: {
      // The dimensions live on the yacht here, not on the model as in NauSYS.
      lengthM: numberOf(yacht.length) ?? 0,
      beamM: numberOf(yacht.beam),
      draftM: numberOf(yacht.draught),
      cabins: intOf(yacht.cabins) ?? 0,
      berths: intOf(yacht.berths) ?? 0,
      heads: intOf(yacht.wc) ?? 0,
      yearBuilt: intOf(yacht.year) ?? 0,
      // `engine` is a free-text description ("2 x 75hp Volvo"), never a count.
      engines: undefined,
      fuelCapacity: capacityOf(yacht.fuelCapacity),
      waterCapacity: capacityOf(yacht.waterCapacity),
    },
    media: mediaOf(yacht),
    amenities: amenityIdsOf(yacht).filter((id) => context.knownEquipment.has(id)),
    texts: textsOf(yacht),
    checkinRules: checkinRulesOf(yacht),
    // The catalogue states no one-way periods; `/offers` is where a one-way charter
    // shows up, as a start base that differs from the end base.
    oneWayRules: [],
    defaultCurrency: currency,
    securityDepositMinor: minorOf(yacht.deposit, currency),
    // Booking Manager publishes no review aggregate, and absent must stay absent: a
    // yacht nobody has rated is not a yacht rated zero.
    rating: undefined,
    reviewCount: undefined,
    // Payment terms arrive per period on `/offers`, never in the catalogue.
    paymentPolicy: undefined,
  };
}

/** `name` usually already carries the model, so appending it blindly gives "Bavaria 46 Bavaria 46". */
function titleOf(yacht: RestYacht, modelName: string | undefined): string {
  const name = text(yacht.name);
  if (name === undefined) return modelName ?? `Yacht ${yacht.id}`;
  if (modelName === undefined || name.toLowerCase().includes(modelName.toLowerCase())) return name;
  return `${name} ${modelName}`;
}

/**
 * `equipmentIds` is the compact form and `equipment` the valued one; `equipmentRaw`
 * only appears when the sync asked for `inventory=raw`. Any of the three answers
 * the same question, so the first one present wins.
 */
function amenityIdsOf(yacht: RestYacht): string[] {
  const sources: (string | null)[][] = [
    (yacht.equipmentIds ?? []).map((value) => idOf(value)),
    (yacht.equipment ?? []).map((item) => idOf(item.id)),
    (yacht.equipmentRaw ?? []).map((item) => idOf(item.id)),
  ];

  for (const source of sources) {
    const ids = source.filter((id): id is string => id !== null);
    if (ids.length > 0) return [...new Set(ids)];
  }
  return [];
}

/**
 * `sortOrder` is the vendor's own ordering and the first image is the cover shot;
 * nothing in the payload marks an accommodation layout, so no image is ever filed
 * as one. Duplicate URLs are dropped because the same photo repeats across
 * products on recorded yachts.
 */
function mediaOf(yacht: RestYacht) {
  const images = [...(yacht.images ?? [])]
    .map((image, index) => ({
      url: text(image.url),
      sortOrder: intOf(image.sortOrder) ?? index,
      index,
    }))
    .filter((image): image is { url: string; sortOrder: number; index: number } => {
      return image.url !== undefined;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.index - right.index);

  const media: { externalUrl: string; role: "main" | "gallery"; sortOrder: number }[] = [];
  const seen = new Set<string>();

  for (const image of images) {
    const url = image.url;
    if (seen.has(url)) continue;
    seen.add(url);
    media.push({
      externalUrl: url,
      role: media.length === 0 ? "main" : "gallery",
      sortOrder: media.length,
    });
  }

  return media;
}

function textsOf(yacht: RestYacht) {
  const blocks = new Map<TextKind, { category: string | undefined; value: string }[]>();

  for (const description of yacht.descriptions ?? []) {
    const value = stripHtml(text(description.text));
    if (value === undefined) continue;

    const category = text(description.category);
    const kind = textKindOf(category);
    const bucket = blocks.get(kind) ?? [];
    bucket.push({ category, value });
    blocks.set(kind, bucket);
  }

  // `listing_text` is unique on (listing, kind, locale), so several categories that
  // read as the same kind are merged into one entry, each keeping its heading.
  return [...blocks.entries()].map(([kind, entries]) => ({
    kind,
    locale: CATALOGUE_LOCALE,
    value:
      entries.length === 1 && entries[0]
        ? entries[0].value
        : entries
            .map((entry) => (entry.category ? `${entry.category}\n${entry.value}` : entry.value))
            .join("\n\n"),
  }));
}

function textKindOf(category: string | undefined): TextKind {
  if (category === undefined) return "description";
  return TEXT_KIND_RULES.find((rule) => rule.pattern.test(category))?.kind ?? "description";
}

/**
 * One rule, because the vendor states one turnaround day and one minimum duration
 * per yacht rather than a table of periods.
 *
 * `defaultCheckInDay` is read as ISO weekday numbering (1 Monday .. 7 Sunday) and
 * converted to the JavaScript numbering `listing_checkin_rule` stores. The spec
 * gives the field no range, so this is an assumption (Q-BM-CHECKIN-DAY); check-out
 * is taken to fall on the same weekday, which is what a whole-week charter does.
 */
function checkinRulesOf(yacht: RestYacht) {
  const weekday = weekdayOf(yacht.defaultCheckInDay);
  const minNights = positiveInt(yacht.minimumCharterDuration);
  if (weekday === undefined && minNights === undefined) return [];

  return [
    {
      checkinWeekday: weekday,
      checkoutWeekday: weekday,
      minNights,
      maxNights: undefined,
    },
  ];
}

function weekdayOf(value: JsonField): number | undefined {
  const parsed = intOf(value);
  if (parsed === undefined || parsed < 0 || parsed > 7) return undefined;
  return parsed % 7;
}

/* ----------------------------------------------------------------- helpers */

/** Turnaround times stay wall-clock strings; only the shape is checked. */
function clockTime(value: JsonField): string | undefined {
  const raw = text(value);
  return raw !== undefined && /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw) ? raw : undefined;
}

/** Zero is how the vendor writes a tank it has not measured. */
function capacityOf(value: JsonField): number | undefined {
  const parsed = intOf(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/** Coordinates arrive as strings, and "0" is the vendor's unset marker, not the Gulf of Guinea. */
function coordinateOf(value: JsonField): number | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}

function countryCodeOf(country: RestCountry): string {
  // See `restCountrySchema`: the Swagger and the vendor's integration guide
  // disagree on whether these are `short`/`long` or `shortName`/`longName`.
  const short = text(country.short) ?? text(country.shortName);
  return short !== undefined && short.length <= 3
    ? short.toUpperCase()
    : `${PROVIDER_PREFIX}-${country.id}`;
}

/**
 * Amounts stay strings until they are integers of minor units; the vendor sends
 * bare numbers, which are stringified rather than scaled by floating point. A
 * malformed amount drops the deposit rather than the yacht.
 */
function minorOf(value: JsonField, currency: string): number | undefined {
  const numeric = numberOf(value);
  const amount = numeric === undefined ? text(value) : String(numeric);
  if (amount === undefined) return undefined;
  try {
    return decimalStringToMinor(amount, currency);
  } catch {
    return undefined;
  }
}
