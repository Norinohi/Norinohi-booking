import type { z } from "zod";

import type { JsonField } from "../shared/json";
import { parseBookingManagerDate } from "./dates";
import { regionFor } from "./geography";
import { crewRoleOf } from "../shared/crew-role";
import { stripHtml } from "../shared/html-text";
import { decimalStringToMinor } from "../shared/money";
import { isPlaceholderBuilder } from "../shared/placeholder-builders";
import { mergeYachtTitle } from "../shared/yacht-title";
import { wallClockTime } from "../shared/wall-clock";
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
  type CatalogueProjectionContext,
  type CanonicalExtra,
  type CrewType,
  type ProviderRecordSet,
} from "../types";
import {
  restBaseSchema,
  restCompanySchema,
  restCountrySchema,
  restEquipmentSchema,
  restExtrasSchema,
  restProductSchema,
  restSailingAreaSchema,
  restShipyardSchema,
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
 * Booking Manager returns one language per request and the catalogue sync asks for none
 * except on `/equipment`, whose names per locale arrive as `translations` on each item. Every
 * other string here is the vendor's default, which recorded responses show to be English.
 */
const CATALOGUE_LOCALE = "en";

/**
 * Used only when no yacht files an `/equipment` item under any category. Not "Equipment": the
 * writer keys categories by name, and that is also a category operators name themselves.
 */
const UNCATEGORISED_AMENITY_CATEGORY = { externalId: "uncategorised", name: "Uncategorised" };

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

export function projectBookingManagerCatalogue(
  records: ProviderRecordSet,
  context: CatalogueProjectionContext = { referenceRegions: [] },
): CanonicalCatalogue {
  const equipment = parseAll(records, "equipment_category", restEquipmentSchema);
  const shipyards = parseAll(records, "builder", restShipyardSchema).filter(
    (item) => !isPlaceholderBuilder(text(item.name) ?? text(item.shortName)),
  );
  const yachtTypes = parseAll(records, "category", restYachtTypeSchema);
  const companies = parseAll(records, "company", restCompanySchema);
  const yachts = parseAll(records, "yacht", restYachtSchema);

  const knownShipyards = new Set(shipyards.map((item) => String(item.id)));
  const knownEquipment = new Set(equipment.map((item) => String(item.id)));

  const geography = projectBookingManagerGeography(records, context);

  const categoryIdByKind = new Map(
    yachtTypes
      .map((item) => text(item.name))
      .filter((name): name is string => name !== undefined)
      .map((name) => [name.toLowerCase(), name]),
  );

  const amenities = projectAmenities(equipment, yachts);
  const models = projectModels(yachts, knownShipyards);
  const baseTimes = baseTimesOf(yachts);

  const sailingAreasByBase = sailingAreasByBaseOf(parseAll(records, "base", restBaseSchema));

  const listings = yachts
    .map((yacht) =>
      projectYacht(yacht, {
        categoryIdByKind,
        knownEquipment,
        knownShipyards,
        sailingAreasByBase,
      }),
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return canonicalCatalogueSchema.parse({
    countries: geography.countries,
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
        // The only place the vendor publishes a cancellation policy, inside the
        // wider terms; see `termsAndConditions` on `restCompanySchema`.
        termsAndConditions: text(item.termsAndConditions),
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
type RestProduct = z.infer<typeof restProductSchema>;
type RestExtras = z.infer<typeof restExtrasSchema>;

/**
 * Booking Manager's geography is not our geography.
 *
 * Ours is country → region → location → base. The vendor's is world region →
 * country → base, with sailing areas hanging off bases as an unrelated many-to-many
 * and no country of their own. So the chain is rebuilt from the bases outward: a
 * base names its country, its sailing areas, its town and its coordinates.
 *
 * The region is one the other vendor's boats already sail from in that country,
 * picked by `regionFor`, so a Split base lands in "Split region" beside
 * them and one search filter finds both fleets. Only where no such region fits does
 * the base fall back to its sailing area's own name, then its country's. The world
 * region is never used: it once named the region, and filed Croatia, Greece and six
 * more under a "Southern Europe" region with a catalogue page of its own.
 *
 * The location is the base's town, which the vendor states and our other vendor does
 * not, so it also fills `location.city`.
 *
 * Bases already written somewhere else are moved by `geography:repair-bm`, which
 * keeps their ids and the routes attached to them. A sync that gets there first
 * creates new base rows instead and strands those routes.
 */
export function projectBookingManagerGeography(
  records: ProviderRecordSet,
  context: CatalogueProjectionContext,
) {
  const countries = parseAll(records, "country", restCountrySchema);
  const sailingAreas = parseAll(records, "location", restSailingAreaSchema);
  const bases = parseAll(records, "base", restBaseSchema);

  const countryById = new Map(countries.map((item) => [String(item.id), item]));
  const sailingAreaNameById = new Map<string, string>();
  for (const item of sailingAreas) {
    const name = text(item.name);
    if (name !== undefined) sailingAreaNameById.set(String(item.id), name);
  }

  const regions = new Map<
    string,
    { externalId: string; externalCountryId: string; name: string }
  >();
  const locations = new Map<
    string,
    { externalId: string; externalRegionId: string; name: string; city?: string }
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

    const country = countryById.get(countryId);
    const countryName = text(country?.name) ?? text(country?.long) ?? `Country ${countryId}`;
    const point = pointOf(item);
    const lat = point?.lat;
    const lng = point?.lng;

    const sailingAreaNames = (item.sailingAreas ?? [])
      .map((value) => {
        const id = idOf(value);
        return id === null ? undefined : sailingAreaNameById.get(id);
      })
      .filter((name): name is string => name !== undefined);

    const regionName =
      (country === undefined
        ? undefined
        : regionFor(
            {
              countryCode: countryCodeOf(country),
              sailingAreas: sailingAreaNames,
              point: lat === undefined || lng === undefined ? undefined : { lat, lng },
            },
            context.referenceRegions,
          )) ??
      sailingAreaNames[0] ??
      countryName;
    const city = text(item.city);
    const locationName = city ?? sailingAreaNames[0] ?? regionName;

    // Keyed by name within the country: two sailing areas placed into one region are
    // one region, and a town is one location however many areas list it.
    const regionExternalId = `region:${countryId}:${regionName}`;
    regions.set(regionExternalId, {
      externalId: regionExternalId,
      externalCountryId: countryId,
      name: regionName,
    });

    const locationExternalId = `location:${countryId}:${regionName}:${locationName}`;
    locations.set(locationExternalId, {
      externalId: locationExternalId,
      externalRegionId: regionExternalId,
      name: locationName,
      city,
    });

    projectedBases.push({
      externalId: String(item.id),
      externalLocationId: locationExternalId,
      name: baseNameOf(item),
      lat,
      lng,
    });
  }

  return {
    countries: countries.map((item) => ({
      externalId: String(item.id),
      // ISO-2 first: it is what makes the same country from two providers one row.
      code: countryCodeOf(item),
      name: text(item.name) ?? text(item.long) ?? text(item.longName) ?? `Country ${item.id}`,
    })),
    regions: [...regions.values()],
    locations: [...locations.values()],
    bases: projectedBases,
  };
}

/**
 * `city / name`, which is the form the vendor itself returns on `/offers`.
 *
 * The name alone does not locate anything: Le Boat moors boats at bases called "The Marina"
 * in several countries, and the detail page pairs the base name with its sailing area, so an
 * Irish canal boat read as "The Marina, European Inland, Ireland" with no town in it. The city
 * is already in the payload and was being dropped. Folded in only when the name does not
 * already carry it, so "Kastela / Marina Kastela" does not become a stutter.
 */
function baseNameOf(item: RestBase): string {
  const name = text(item.name);
  const city = text(item.city);
  if (name === undefined) return city ?? `Base ${item.id}`;
  if (city === undefined || name.toLowerCase().includes(city.toLowerCase())) return name;
  return `${city} / ${name}`;
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
 * Amenity categories exist nowhere in the vendor's reference data: `/equipment` is a flat
 * id/name list, and the only mention of a category is `categoryName` on a yacht's
 * `equipmentRaw` rows, which each operator writes for itself.
 *
 * A raw row's own `id` is in a different space from `/equipment` (0 of 327 matches on company
 * 225); its `parentId` is the `/equipment` id it specialises, and `-1` marks an item the operator
 * added that `/equipment` does not list. So an amenity takes the category its fleet files it
 * under most, read through `parentId`, and only an amenity no row points at falls back to rows
 * of the same name. One fitting arrives under several categories (Radar as "Instruments" and as
 * "Equipment"), and the catch-alls say nothing about where it belongs, so a specific category
 * beats them; the rest is decided by count, then name, so a re-sync never flips it.
 */
function projectAmenities(equipment: z.infer<typeof restEquipmentSchema>[], yachts: RestYacht[]) {
  const categoryNames = new Map<string, string>();
  const byParent = new Map<string, Map<string, number>>();
  const byName = new Map<string, Map<string, number>>();

  const tally = (index: Map<string, Map<string, number>>, key: string, categoryId: string) => {
    const counts = index.get(key) ?? new Map<string, number>();
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    index.set(key, counts);
  };

  for (const yacht of yachts) {
    for (const item of yacht.equipmentRaw ?? []) {
      const categoryName = text(item.categoryName);
      if (categoryName === undefined) continue;

      const categoryId = slugify(categoryName);
      if (categoryId === "") continue;
      if (!categoryNames.has(categoryId)) categoryNames.set(categoryId, categoryName);

      const parentId = idOf(item.parentId);
      if (parentId !== null && parentId !== "-1") tally(byParent, parentId, categoryId);
      const name = text(item.name);
      if (name !== undefined) tally(byName, name.toLowerCase(), categoryId);
    }
  }

  let needsFallback = false;
  const amenities = equipment.map((item) => {
    const name = text(item.name) ?? `Equipment ${item.id}`;
    const categoryId = likeliestCategory(
      byParent.get(String(item.id)) ?? byName.get(name.toLowerCase()),
    );
    if (categoryId === undefined) needsFallback = true;

    return {
      externalId: String(item.id),
      externalAmenityCategoryId: categoryId ?? UNCATEGORISED_AMENITY_CATEGORY.externalId,
      // The resolver splits this prefix back off to recover the vendor id, so the
      // shape is load-bearing, not cosmetic.
      code: `${PROVIDER_PREFIX}:${item.id}`,
      name,
      translations: translationsOf(item.translations, name),
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
 * The names `/equipment` returned per language, less those that are only the English again: the
 * vendor leaves about a quarter of its items untranslated in every language, and a copy stored
 * as a translation would outrank the curated label for that locale.
 */
function translationsOf(
  names: Record<string, string> | null | undefined,
  english: string,
): Record<string, string> | undefined {
  const translated = Object.entries(names ?? {}).flatMap(([locale, value]) => {
    const name = text(value);
    return name === undefined || name.toLowerCase() === english.toLowerCase()
      ? []
      : [[locale, name] as const];
  });
  return translated.length === 0 ? undefined : Object.fromEntries(translated);
}

/** The operators' names for "everything else", by slug. */
const CATCH_ALL_CATEGORIES = new Set([
  "equipment",
  "other-equipment",
  "standard-equipment",
  "more-equipment",
  "all-equipment",
  "additional",
  "amenities",
  "facilities",
  "miscellaneous",
  "general",
  "inventory",
]);

function likeliestCategory(counts: ReadonlyMap<string, number> | undefined): string | undefined {
  if (counts === undefined) return undefined;
  const ranked = [...counts.entries()].sort(
    ([leftId, leftCount], [rightId, rightCount]) =>
      Number(CATCH_ALL_CATEGORIES.has(leftId)) - Number(CATCH_ALL_CATEGORIES.has(rightId)) ||
      rightCount - leftCount ||
      leftId.localeCompare(rightId),
  );
  return ranked[0]?.[0];
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
    sailingAreasByBase: ReadonlyMap<string, ReadonlySet<string>>;
  },
) {
  const companyId = idOf(yacht.companyId);
  const baseId = idOf(yacht.homeBaseId);
  // `listing.operator_id` and `listing.home_base_id` are both NOT NULL and there is
  // nothing to guess from.
  if (companyId === null || baseId === null) return null;

  const externalId = String(yacht.id);
  const model = modelKeyOf(yacht);
  const title = mergeYachtTitle(text(yacht.name), model?.name) ?? `Yacht ${yacht.id}`;
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
    name: text(yacht.name),
    title,
    slug: `${slugify(title)}-${externalId}`,
    spec: {
      // The dimensions live on the yacht here, not on the model as in NauSYS.
      lengthM: numberOf(yacht.length) ?? 0,
      beamM: numberOf(yacht.beam),
      draftM: numberOf(yacht.draught),
      cabins: intOf(yacht.cabins) ?? 0,
      berths: intOf(yacht.berths) ?? 0,
      // Stated on about half the account's yachts, below the berths on 215 of them.
      maxPersons: positiveInt(yacht.maxPeopleOnBoard),
      heads: intOf(yacht.wc) ?? 0,
      // The vendor publishes `wc` and nothing about showers, so the count stays unknown.
      yearBuilt: intOf(yacht.year) ?? 0,
      ...engineOf(text(yacht.engine)),
      fuelCapacity: capacityOf(yacht.fuelCapacity),
      waterCapacity: capacityOf(yacht.waterCapacity),
      sailType: sailTypeOf(text(yacht.mainsailType)),
    },
    crewType: crewTypeOf(soldProductOf(yacht)),
    skipperLicenceRequired: licenceRequiredOf(yacht.requiredSkipperLicense),
    media: mediaOf(yacht),
    amenities: amenityIdsOf(yacht).filter((id) => context.knownEquipment.has(id)),
    extras: extrasOf(yacht, currency, context.sailingAreasByBase.get(baseId)),
    texts: textsOf(yacht),
    checkinRules: checkinRulesOf(yacht),
    // The catalogue states no one-way periods; `/offers` is where a one-way charter
    // shows up, as a start base that differs from the end base.
    oneWayRules: [],
    defaultCurrency: currency,
    checkInTime: wallClockTime(text(yacht.defaultCheckInTime)),
    checkOutTime: wallClockTime(text(yacht.defaultCheckOutTime)),
    securityDepositMinor: minorOf(yacht.deposit, currency),
    securityDepositWhenInsuredMinor: waivedDepositOf(yacht, currency),
    // Booking Manager prices the yacht and its deposit in one currency.
    securityDepositCurrency: currency,
    // Booking Manager publishes no review aggregate, and absent must stay absent: a
    // yacht nobody has rated is not a yacht rated zero.
    rating: undefined,
    reviewCount: undefined,
    // Payment terms arrive per period on `/offers`, never in the catalogue.
    paymentPolicy: undefined,
  };
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

type MediaRole = "main" | "layout" | "gallery";

/**
 * The operator labels each picture in `description`: "Main image" is the cover it chose, "Plan
 * image" the accommodation layout, "Interior image" and a blank the rest. Taking the first
 * picture as the cover put a deck plan on about 1,370 cards and an interior on about 1,280; on
 * company 225 "Main image" is first on 5 of the 20 yachts with pictures.
 *
 * `sortOrder` is 0 on every picture of that fleet and on most account-wide, so it orders only
 * where it is set: a picture carrying none follows every one that does, and the vendor's array
 * order decides the rest. A yacht naming no main image
 * takes its first picture that is not a plan; one showing only plans has no cover at all, which
 * ranks its layouts behind any other offer's photos rather than presenting a drawing as the boat.
 * Duplicate URLs are dropped because the same photo repeats across products.
 */
function mediaOf(yacht: RestYacht) {
  const images = [...(yacht.images ?? [])]
    .map((image, index) => ({
      url: text(image.url),
      label: text(image.description)?.toLowerCase(),
      sortOrder: intOf(image.sortOrder) ?? Number.MAX_SAFE_INTEGER,
      index,
    }))
    .filter((image): image is typeof image & { url: string } => image.url !== undefined)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.index - right.index);

  const cover =
    images.find((image) => image.label === "main image") ??
    images.find((image) => image.label !== "plan image");

  const media: { externalUrl: string; role: MediaRole; sortOrder: number }[] = [];
  const seen = new Set<string>();

  for (const image of cover === undefined ? images : [cover, ...images]) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    media.push({
      externalUrl: image.url,
      role: image === cover ? "main" : image.label === "plan image" ? "layout" : "gallery",
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
 * The check-in days and minimum stay the vendor publishes, as it publishes them.
 *
 * `allCheckInDays` is exact, measured against `/offers` on the live account (Sep 2026, see
 * scripts/audit/bm-checkin-days.ts): a week starting on a listed day was offered 73-100% of the
 * time inside a stretch the yacht was free, and on an unlisted day 0 of 28 times.
 *
 * A yacht listing every day gets one rule with no weekday. The same probe sold such yachts from
 * any day at their stated `minimumCharterDuration` and refused anything shorter (0 of 13), and
 * sold the ones stating none (0) for two nights and up. Seven paired rules would say the same
 * thing seven times, and the charter-period line on the detail page would read them out.
 *
 * A yacht listing some days turns around on them, at both ends: a charter from one listed day to
 * another sold exactly as often as a whole week (19 of 25 each, the rest booked outright), and
 * one ending on an unlisted day 4 of 25, all four from one operator. So every ordered pair of
 * listed days is a rule, and `checkinRuleClause` reads the length each pair allows.
 *
 * This used to narrow any list containing Saturday to Saturday alone, because `/prices` is swept
 * Saturday to Saturday and `/offers` was thought to refuse the rest. The confirming sweep prices
 * every week the cards advertise, whatever its weekday, and the narrowing hid 80,900 charters the
 * vendor had priced as free: a Monday search found 606 yachts against 8,506 on the Saturday.
 */
function checkinRulesOf(yacht: RestYacht) {
  const minNights = positiveInt(yacht.minimumCharterDuration);
  const maxNights = maxNightsOf(yacht, minNights);

  const days = Array.isArray(yacht.allCheckInDays)
    ? yacht.allCheckInDays.map(weekdayOf).filter((day): day is number => day !== undefined)
    : [];
  const offered = [
    ...new Set(days.length > 0 ? days : [weekdayOf(yacht.defaultCheckInDay)]),
  ].filter((day): day is number => day !== undefined);

  if (offered.length === 7 || offered.length === 0) {
    if (offered.length === 0 && minNights === undefined && maxNights === undefined) return [];
    return [{ checkinWeekday: undefined, checkoutWeekday: undefined, minNights, maxNights }];
  }

  return offered.flatMap((checkin) =>
    offered.map((checkout) => ({
      checkinWeekday: checkin,
      checkoutWeekday: checkout,
      minNights,
      maxNights,
    })),
  );
}

/**
 * `maximumCharterDuration`, in the same nights as the minimum beside it. Checked against the
 * confirming `/offers` sweep: of every priced charter stored for the yachts stating a limit under
 * 60, none ran longer than it. 90 is the fleet default and caps nothing a week search asks.
 *
 * A limit below the minimum contradicts it, and no charter at all was priced on those yachts,
 * so the minimum is kept alone rather than publishing a rule nothing can satisfy.
 */
function maxNightsOf(yacht: RestYacht, minNights: number | undefined): number | undefined {
  const maxNights = positiveInt(yacht.maximumCharterDuration);
  if (maxNights === undefined || (minNights !== undefined && maxNights < minNights)) {
    return undefined;
  }
  return maxNights;
}

/**
 * Booking Manager numbers weekdays 1 Sunday .. 7 Saturday, so the JavaScript
 * weekday `listing_checkin_rule` stores is one less.
 *
 * Confirmed against the live test fleet rather than the specification, which
 * documents no range: every yacht there sends `defaultCheckInDay: 7`, and every
 * booking in its 2026 availability starts on a Saturday. Reading the field as ISO
 * (1 Monday .. 7 Sunday) put the turnaround on Sunday and would have synthesized
 * every bookable week a day off the one the vendor actually sells.
 *
 * `-1` is the vendor's "any day", which arrives alongside a full `allCheckInDays`
 * list, so it is dropped here rather than mapped.
 */
function weekdayOf(value: JsonField): number | undefined {
  const parsed = intOf(value);
  if (parsed === undefined || parsed < 1 || parsed > 7) return undefined;
  return parsed - 1;
}

/**
 * The mainsail in the vocabulary NauSYS resolves its `sailTypes` to, so one Mainsail filter
 * finds both fleets and the curated `sail_type` labels translate it.
 *
 * The vendor's list is closed: every yacht on the account sends one of these three or "None".
 * "Semi full batten" is NauSYS's half batten, battens run full length only part-way down.
 * "None" (German "Keine") is how the vendor writes a boat with no mainsail, not a rig called
 * None, and anything outside the list is left unset rather than published as a new facet.
 * `genoaType` has nowhere to go: the spec block and the filters know the mainsail only.
 */
const SAIL_TYPES = new Map([
  ["full batten", "full batten"],
  ["semi full batten", "half batten"],
  ["furling", "furling/roll"],
]);

function sailTypeOf(value: string | undefined): string | undefined {
  return value === undefined ? undefined : SAIL_TYPES.get(value.toLowerCase());
}

/**
 * `engine` is the operator's own line ("2 x 38 HP", "Volvo 40 h.p.", "Yanmar Diesel"), so the
 * power is read where it carries a unit and the count only where it is written as a multiple.
 * A bare figure ("78", "27.3") could be either unit and is left unread, as is a brand alone.
 * Metric horsepower (PS, CV, KS) is written as hp, the unit the rest of the catalogue prints;
 * the two differ by 1.4%.
 */
const ENGINE_POWER = /(\d+(?:[.,]\d+)?)\s*(b?hp|h\.\s?p\.?|ps|cv|ks|kw)(?![a-z])/i;
const ENGINE_COUNT = /(?<![\d.,])([1-4])\s*[x\u00d7]/i;

type EngineSpec = { engines?: number; enginePower?: string };

function engineOf(value: string | undefined): EngineSpec {
  const engine: EngineSpec = {};
  if (value === undefined) return engine;

  const count = ENGINE_COUNT.exec(value)?.[1];
  if (count !== undefined) engine.engines = Number(count);

  const power = ENGINE_POWER.exec(value);
  const figure = power?.[1]?.replace(",", ".");
  if (power !== null && figure !== undefined && Number(figure) > 0) {
    const unit = power[2]?.toLowerCase() === "kw" ? "kW" : "hp";
    engine.enginePower = `${Number(figure)} ${unit}`;
  }

  return engine;
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
function coordinateOf(value: JsonField, limit: number): number | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed !== 0 && Math.abs(parsed) <= limit ? parsed : undefined;
}

/**
 * Both coordinates or neither. Half a point is not a place: Shelter Bay Marina in Panama arrives
 * as latitude 0 and longitude 9.37, its latitude in the wrong field, and kept alone that longitude
 * pinned the base off West Africa and pulled it towards whatever region lies nearest there.
 * "to be reused" carries 363931 / 280454, which no reading of degrees makes a place either.
 */
function pointOf(item: RestBase): { lat: number; lng: number } | undefined {
  const lat = coordinateOf(item.latitude, 90);
  const lng = coordinateOf(item.longitude, 180);
  return lat === undefined || lng === undefined ? undefined : { lat, lng };
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
 * The vendor's whole-number percentage as the rate the rest of the codebase carries: 40 -> 0.4.
 *
 * Zero and absent are the same answer here -- a fee of nothing is money, not a share -- so both
 * leave the row to be read as a price.
 */
function percentageRateOf(percentage: number | null | undefined): number | undefined {
  if (percentage == null || !Number.isFinite(percentage) || percentage <= 0) return undefined;
  return percentage / 100;
}

/**
 * The priced extras behind the listing's two paid sections. Unlike NauSYS these
 * name themselves, so no reference list has to resolve them.
 *
 * Taken from the product the listing sells and no other. Every product carries its own
 * extras ("each product has its own elaboration of applicable extras"), and `/offers`,
 * `/prices` and the reservation all go to the default product when none is named, which
 * nothing here does. Merging every product's list put a Flotilla fleet's 800 EUR
 * obligatory package on the bareboat card of about 165 listings, and a Crewed product's
 * obligatory skipper turned a bareboat into a skippered one.
 */
function extrasOf(
  yacht: RestYacht,
  fallbackCurrency: string,
  homeSailingAreas: ReadonlySet<string> | undefined,
): CanonicalExtra[] {
  const homeBaseId = idOf(yacht.homeBaseId);
  const chosen = new Map<string, CanonicalExtra>();
  for (const item of soldProductOf(yacht)?.extras ?? []) {
    const externalId = idOf(item.id);
    const label = text(item.name);
    // An extra with no id cannot be kept stable across syncs, and one with no
    // name cannot be shown to a buyer.
    if (externalId === null || label === undefined) continue;
    if (chosen.has(externalId)) continue;
    if (!soldInSailingArea(item, homeSailingAreas)) continue;

    const priceCurrency = currencyOf(item.currency, fallbackCurrency);
    /*
     * A fee the operator states as a share of the charter rather than as money. The vendor
     * populates `percentage` and leaves `price` at zero -- the quote path has always read it
     * (`percentageOfCharter`), and the catalogue never did, so 335 obligatory fees across 278
     * listings reached the card as free. An APA at 40% is the common one, and a crewed yacht
     * advertised 56,500 EUR against a quote of 76,501.
     */
    const rate = percentageRateOf(item.percentage);
    const priceMinor = rate === undefined ? minorOf(item.price, priceCurrency) : 0;
    if (priceMinor === undefined) continue;

    chosen.set(externalId, {
      // The vendor numbers extras in one space of its own, with no separate
      // equipment pricing list to tell apart.
      kind: "service",
      externalId,
      name: label,
      obligatory: item.obligatory === true,
      ...(rate === undefined ? null : { percentage: rate }),
      priceMinor,
      priceCurrency,
      priceMeasure: text(item.unit),
      calculationType: undefined,
      // `false` here is a real statement, so it is kept apart from the vendor saying nothing.
      payableInBase: item.payableInBase ?? undefined,
      seasonStart: sailingDateOf(item.sailingDateFrom),
      seasonEnd: sailingDateOf(item.sailingDateTo),
      validNightsFrom: positiveInt(item.validDaysFrom),
      validNightsTo: positiveInt(item.validDaysTo),
      ...routeScopeOf(item),
      ...includedIdsOf(item, externalId),
      ...quantityOf(item),
      // The operator's own fine print: "Applies only when skipper is chosen", a pack's contents.
      note: stripHtml(text(item.description)),
      onRequestOnly: false,
      ...((item.includesDepositWaiver ?? item.includedDepositWaiver) === true
        ? { depositInsurance: true }
        : null),
      ...obligatoryCrewRoleOf(item, label, priceMinor, rate),
      // Filed under the home base, which is where the card's charter starts and ends, so the
      // read model can test the base and route conditions above against it.
      externalBaseId: homeBaseId ?? undefined,
    });
  }
  return [...chosen.values()];
}

type ExtraRouteScope = Pick<CanonicalExtra, "oneWayOnly" | "validForBaseIds" | "validRoutes">;

/**
 * Where an extra is charged, from the two ways the vendor restricts one.
 *
 * `validForBases` is a list of allowed routes, each any base of `from` to any base of `to`.
 * A fee is one-way only when none of those routes returns to where it started; "APA 25%",
 * "VAT - Greece 6.5%" and "Skipper obligatory" arrive restricted to a return from the home
 * base on about 120 hulls, and treating every restricted fee as one-way took them off the card.
 *
 * `availableInBase` names the one base an extra is sold at, `-1` meaning all of them.
 */
function routeScopeOf(item: RestExtras): ExtraRouteScope {
  const scope: ExtraRouteScope = {};

  const routes = new Map<string, { from: string; to: string }>();
  for (const pairs of item.validForBases ?? []) {
    for (const from of pairs.from ?? []) {
      for (const to of pairs.to ?? []) routes.set(`${from}>${to}`, { from, to });
    }
  }
  if (routes.size > 0) {
    scope.validRoutes = [...routes.values()];
    if (!scope.validRoutes.some((route) => route.from === route.to)) scope.oneWayOnly = true;
  }

  const base = item.availableInBase;
  if (base != null && base !== "-1") scope.validForBaseIds = [base];

  return scope;
}

/** Undocumented; see `includedExtras` on `restExtrasSchema`. An extra never bundles itself. */
function includedIdsOf(
  item: RestExtras,
  externalId: string,
): Pick<CanonicalExtra, "includedExternalIds"> {
  const ids = [...new Set(item.includedExtras ?? [])].filter((id) => id !== externalId);
  return ids.length > 0 ? { includedExternalIds: ids } : {};
}

/**
 * Whether an extra restricted to sailing areas is sold where this yacht is based. An operator
 * files one extras list across a fleet spread over several areas, so "CharterPack Caribbean
 * (Cleaning + Bedlinen + Towels + First Gas bottle)" at 750 EUR obligatory arrives on its
 * Mediterranean hulls too. A base whose areas the dump did not name keeps the extra: silence is
 * not a reason to hide a fee.
 */
function soldInSailingArea(
  item: RestExtras,
  homeSailingAreas: ReadonlySet<string> | undefined,
): boolean {
  const areas = item.validSailingAreas ?? [];
  if (areas.length === 0 || homeSailingAreas === undefined || homeSailingAreas.size === 0) {
    return true;
  }
  return areas.some((area) => homeSailingAreas.has(area));
}

function sailingAreasByBaseOf(bases: readonly RestBase[]): Map<string, Set<string>> {
  const byBase = new Map<string, Set<string>>();
  for (const item of bases) {
    const areas = (item.sailingAreas ?? [])
      .map((value) => idOf(value))
      .filter((area): area is string => area !== null);
    byBase.set(String(item.id), new Set(areas));
  }
  return byBase;
}

/** `-1` is the vendor's unlimited, and so is a limit it did not send. */
function quantityOf(
  item: RestExtras,
): Pick<CanonicalExtra, "quantityLimit" | "quantitySelectable"> {
  const limit = item.quantityLimit;
  const quantity: Pick<CanonicalExtra, "quantityLimit" | "quantitySelectable"> = {};
  if (limit != null && Number.isInteger(limit) && limit >= 0) quantity.quantityLimit = limit;
  if (item.quantityIsSelectable != null) quantity.quantitySelectable = item.quantityIsSelectable;
  return quantity;
}

/**
 * How the listing is sold, read off the product it sells, which is also the product every
 * `/offers` call prices when none is named.
 *
 * `crewedByDefault` is the vendor's own answer and is set on every product account-wide
 * (Crewed 1,520 default products, Powered 81, AllInclusive 19, DailyCharter 11). Skippered (53)
 * is crewed too, but only by the skipper the customer still sails with. Bareboat and every
 * Flotilla variant are sailed by the customer. Cabin (154) and Berth are left unset: they sell
 * a place aboard with whatever crew the operator names in its extras, and `crew_type` backs a
 * search filter, so a guess would file the boat under a charter it does not offer.
 */
function crewTypeOf(product: RestProduct | undefined): CrewType | undefined {
  if (product === undefined) return undefined;
  const name = text(product.name)?.toLowerCase();
  const crewed = product.crewedByDefault ?? (name === "crewed" || name === "skippered");

  if (crewed) return name === "skippered" ? "skipper" : "full-crew";
  if (name === "bareboat" || name?.startsWith("flotilla")) return "bareboat";
  return undefined;
}

/**
 * `requiredSkipperLicense` is 1 or 0 on every yacht of the account (1 on about 9,300, 0 on
 * about 1,900, among them company 225's Giulia). Anything else is not an answer.
 */
function licenceRequiredOf(value: JsonField): boolean | undefined {
  const flag = intOf(value);
  return flag === 1 ? true : flag === 0 ? false : undefined;
}

/**
 * The crew role of an extra the operator bills whatever the customer picks, so the detail page
 * stops asking a skippered charter's customer for a licence and the card files it as skippered.
 *
 * Only obligatory ones. An optional Booking Manager skipper is bought as a requested extra: the
 * vendor's `/offers` prices no optional extra, and the Crew control would move it out of that
 * list into a choice our quote does not charge. An obligatory one is already inside the offer's
 * `obligatoryExtrasPrice`. A zero-priced line is a statement, not a fee ("6% to added on the
 * invoice when the skipper is hired" on 42 hulls), so it names no role either.
 */
function obligatoryCrewRoleOf(
  item: RestExtras,
  label: string,
  priceMinor: number,
  rate: number | undefined,
): Pick<CanonicalExtra, "crewRole"> {
  if (item.obligatory !== true || (priceMinor <= 0 && rate === undefined)) return {};
  const crewRole = crewRoleOf(label);
  return crewRole === undefined ? {} : { crewRole };
}

/**
 * The product `/offers` prices when it is not given one. Every recorded yacht flags exactly
 * one (11,218 of 11,218 account-wide, and all 29 on company 225), so the fallback to the
 * first is only for a payload that flags none, where the vendor's own order is all there is.
 */
function soldProductOf(yacht: RestYacht): RestProduct | undefined {
  const products = yacht.products ?? [];
  return products.find((product) => product.isDefaultProduct === true) ?? products[0];
}

/**
 * The sailing date bounding a seasonal price, or undefined for one the vendor left open.
 *
 * Total, unlike `parseBookingManagerDate`: a malformed bound should cost the extra its season
 * window, not drop the fee or fail the catalogue. An extra with no window is simply never
 * filtered out by season, which is the safe direction for a fee someone still has to pay.
 */
function sailingDateOf(value: JsonField): string | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  try {
    return parseBookingManagerDate(raw);
  } catch {
    return undefined;
  }
}

/**
 * The deposit once the waiver is bought, where it is really a reduction. Zero is the vendor
 * configuring no waiver, and a figure at or above the full deposit reduces nothing, so both
 * leave the ordinary deposit standing alone.
 */
function waivedDepositOf(yacht: RestYacht, currency: string): number | undefined {
  const waived = minorOf(yacht.depositWithWaiver, currency);
  if (waived === undefined || waived <= 0) return undefined;

  const deposit = minorOf(yacht.deposit, currency);
  return deposit !== undefined && waived >= deposit ? undefined : waived;
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
