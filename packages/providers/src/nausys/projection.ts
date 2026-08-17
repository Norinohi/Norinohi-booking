import type { z } from "zod";

import { parseNausysDate } from "../shared/dates";
import { stripHtml } from "../shared/html-text";
import { toLocaleMap } from "../shared/international-text";
import { decimalStringToMinor } from "../shared/money";
import type { JsonField, JsonObject } from "../shared/json";
import {
  currencyOf,
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
  type CanonicalExtra,
  type ProviderRecordSet,
} from "../types";
import {
  restCharterBaseSchema,
  restCharterCompanySchema,
  restCountrySchema,
  restEquipmentCategorySchema,
  restEquipmentSchema,
  restLocationSchema,
  restPriceMeasureSchema,
  restRegionSchema,
  restServiceSchema,
  restYachtBuilderSchema,
  restSailTypeSchema,
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
 * `highlights` is the operator's public blurb and `note` its caveat line; there is
 * no commentary/description/conditions field anywhere in `RestYacht`. Each has an
 * international sibling plus a single-string form holding the same English text.
 */
const TEXT_SOURCES: { kind: "description" | "notes"; intText: string; plain: string }[] = [
  { kind: "description", intText: "highlightsIntText", plain: "highlights" },
  { kind: "notes", intText: "noteIntText", plain: "note" },
];

/**
 * The locale filed against the single-string form. In every recorded yacht it
 * repeats `textEN` verbatim, so English is the reading; flagged as an assumption
 * rather than a fact the vendor states.
 */
const UNLOCALIZED_TEXT_LOCALE = "en";

/** JavaScript weekday numbering, 0 Sunday, as `listing_checkin_rule` stores it. */
const WEEKDAY_FLAGS = [
  { weekday: 0, checkIn: "checkInSunday", checkOut: "checkOutSunday" },
  { weekday: 1, checkIn: "checkInMonday", checkOut: "checkOutMonday" },
  { weekday: 2, checkIn: "checkInTuesday", checkOut: "checkOutTuesday" },
  { weekday: 3, checkIn: "checkInWednesday", checkOut: "checkOutWednesday" },
  { weekday: 4, checkIn: "checkInThursday", checkOut: "checkOutThursday" },
  { weekday: 5, checkIn: "checkInFriday", checkOut: "checkOutFriday" },
  { weekday: 6, checkIn: "checkInSaturday", checkOut: "checkOutSaturday" },
] as const;

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
  const services = parseAll(records, "service", restServiceSchema);
  const priceMeasures = parseAll(records, "price_measure", restPriceMeasureSchema);
  const sailTypes = parseAll(records, "sail_type", restSailTypeSchema);
  const yachts = parseAll(records, "yacht", restYachtSchema);

  const countryNameById = new Map(countries.map((item) => [String(item.id), name(item.name)]));
  const locationNameById = new Map(locations.map((item) => [String(item.id), name(item.name)]));
  const modelById = new Map(models.map((item) => [String(item.id), item]));
  const knownEquipment = new Set(equipment.map((item) => String(item.id)));
  /* Extras are named from these; an id that resolves to nothing is not offered. */
  const equipmentNameById = new Map(
    equipment.flatMap((item) => {
      const label = name(item.name);
      return label === undefined ? [] : [[String(item.id), label] as const];
    }),
  );
  const serviceNameById = new Map(
    services.flatMap((item) => {
      const label = name(item.name);
      return label === undefined ? [] : [[String(item.id), label] as const];
    }),
  );
  const priceMeasureById = new Map(
    priceMeasures.flatMap((item) => {
      const label = name(item.name);
      return label === undefined ? [] : [[String(item.id), label] as const];
    }),
  );
  /* An entry whose English name is missing is dropped: a rig with no label is not a rig. */
  const sailTypeById = new Map(
    sailTypes.flatMap((item) => {
      const label = name(item.name);
      return label === undefined ? [] : [[String(item.id), label] as const];
    }),
  );

  const projectedBases = bases.map((item) => {
    const locationId = String(item.locationId);
    const locationName = locationNameById.get(locationId) ?? `Location ${locationId}`;

    return {
      externalId: String(item.id),
      externalLocationId: locationId,
      // `RestCharterBase` carries no name, so the marina's own location name is
      // the closest thing to one. Deliberately NOT prefixed with the operator: a
      // base is a physical marina, the operator already hangs off the listing, and
      // prefixing both fragmented one marina into a copy per operator and rendered
      // as "Test Charter Company Dubrovnik, Komolac, ACI Marina Dubrovnik".
      //
      // The consequence is that two operators working out of one marina now share
      // a base row, so its check-in and check-out times are last-write-wins. That
      // is the right trade while those times are also on the listing's check-in
      // rules, but it needs revisiting if per-operator base detail starts to matter.
      name: text(item.name) ?? locationName,
      lat: numberOf(item.lat),
      lng: numberOf(item.lon),
      checkInTime: text(item.checkInTime),
      checkOutTime: text(item.checkOutTime),
    };
  });

  const listings = yachts
    .map((yacht) =>
      projectYacht(yacht, {
        modelById,
        knownEquipment,
        sailTypeById,
        equipmentNameById,
        serviceNameById,
        priceMeasureById,
      }),
    )
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
      // Provider-namespaced and vendor-id suffixed: two companies of the same name
      // are two operators, and a slug is the only unique key the operator table
      // offers. The provider prefix matters because the two vendors number their
      // companies independently, so `sunsail-1234` from each would otherwise be one
      // row that each sync overwrote with its own contact details.
      slug: `${PROVIDER_PREFIX}-${slugify(item.name)}-${item.id}`,
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

type ExtraNaming = {
  equipmentNameById: Map<string, string>;
  serviceNameById: Map<string, string>;
  priceMeasureById: Map<string, string>;
};

function projectYacht(
  yacht: RestYacht,
  context: {
    modelById: Map<string, RestYachtModel>;
    knownEquipment: Set<string>;
    sailTypeById: Map<string, string>;
  } & ExtraNaming,
) {
  // The vendor's own withdrawals. `disabled` is a boat taken out of service and
  // `internalUse` one the operator books by hand; publishing either would sell
  // inventory that cannot be reserved.
  if (yacht.disabled === true || yacht.internalUse === true) return null;

  // A yacht with no base cannot become a listing: `listing.home_base_id` is NOT NULL
  // and there is nothing to guess from.
  if (yacht.baseId === undefined) return null;

  const externalId = String(yacht.id);
  const modelId = yacht.yachtModelId === undefined ? undefined : String(yacht.yachtModelId);
  const model = modelId === undefined ? undefined : context.modelById.get(modelId);
  const modelName = model?.name ?? "";
  const title = `${yacht.name} ${modelName}`.trim();
  const currency = currencyOf(seasonCurrencyOf(yacht) ?? yacht.depositCurrency);

  return {
    externalId,
    externalCompanyId: String(yacht.companyId),
    externalBaseId: String(yacht.baseId),
    // An unknown model or builder is left unset rather than fabricated; the writer
    // stores a listing with a null model, which is a gap, not a corruption.
    externalBuilderId:
      model?.yachtBuilderId === undefined ? undefined : String(model.yachtBuilderId),
    externalModelId: model === undefined ? undefined : modelId,
    // Category is a property of the model, not of the boat: `RestYacht` has no
    // category field at all, so an unresolved model also costs the category.
    externalCategoryId:
      model?.yachtCategoryId === undefined ? undefined : String(model.yachtCategoryId),
    title,
    // Name plus vendor id: stable across re-syncs, and unique even for a fleet of
    // ten identically named boats.
    slug: `${slugify(title)}-${externalId}`,
    spec: {
      // Length and beam only ever arrive on the model; the yacht carries neither.
      lengthM: numberOf(model?.loa) ?? 0,
      beamM: numberOf(model?.beam),
      draftM: numberOf(yacht.draft) ?? numberOf(model?.draft),
      cabins: yacht.cabins ?? 0,
      berths: yacht.berthsTotal ?? 0,
      heads: yacht.wc ?? 0,
      yearBuilt: yacht.buildYear ?? 0,
      engines: intOf(yacht.engines),
      fuelCapacity: capacityOf(yacht.fuelTank, model?.fuelTank),
      waterCapacity: capacityOf(yacht.waterTank, model?.waterTank),
      // The vendor names the rig in its own `sailTypes` reference, so an id we cannot
      // resolve is left unset rather than published as a number.
      sailType:
        yacht.sailTypeId === undefined
          ? undefined
          : context.sailTypeById.get(String(yacht.sailTypeId)),
    },
    crewType: crewTypeOf(yacht),
    media: mediaOf(yacht),
    amenities: (yacht.standardYachtEquipment ?? [])
      .map((item) => String(item.equipmentId))
      .filter((id) => context.knownEquipment.has(id)),
    extras: extrasOf(yacht, currency, context),
    texts: textsOf(yacht),
    checkinRules: checkinRulesOf(yacht),
    oneWayRules: oneWayRulesOf(yacht),
    defaultCurrency: currency,
    securityDepositMinor: minorOf(yacht.deposit, currencyOf(yacht.depositCurrency ?? currency)),
    ...euminiaOf(yacht),
    // Payment terms are per period and come from `freeYachts`, never from the
    // catalogue dump.
    paymentPolicy: undefined,
  };
}

/**
 * One rule per allowed (check-in, check-out) weekday pair. A period enables seven
 * named booleans per direction and may enable several at once, which is a genuine
 * choice of start days rather than one day the vendor happened to list first.
 *
 * All seven enabled is no constraint at all, and collapses to an unset weekday:
 * that is what a null column means downstream, and seven identical rows would only
 * multiply the availability synthesis by seven for the same answer.
 *
 * `dateFrom`/`dateTo` bound each period and are dropped here only because
 * `listing_checkin_rule` has no date columns to put them in. Every recorded period
 * spans 1970 to 2099, so nothing is lost today; an operator who changes turnaround
 * day mid-season will need those columns before this is honest.
 */
/**
 * NauSYS splits the question in two: `charterType` says whether the boat is sold crewed, and
 * `crewedCharterType` names the crewed product. A bareboat with `SKIPPER` is the middle case —
 * the customer sails it, with a skipper aboard — which is exactly our `skipper`.
 *
 * Left unset rather than guessed when the pair is unrecognised. `crew_type` drives a search
 * filter, so a wrong value silently files the boat under a charter it does not offer.
 */
function crewTypeOf(yacht: RestYacht): "bareboat" | "skipper" | "full-crew" | undefined {
  const charter = text(yacht.charterType)?.toUpperCase();
  const crewed = text(yacht.crewedCharterType)?.toUpperCase();

  if (charter === "CREWED") return "full-crew";
  if (charter === "BAREBOAT") return crewed === "SKIPPER" ? "skipper" : "bareboat";
  return undefined;
}

function checkinRulesOf(yacht: RestYacht) {
  const rules = new Map<
    string,
    {
      checkinWeekday: number | undefined;
      checkoutWeekday: number | undefined;
      minNights: number | undefined;
      maxNights: undefined;
    }
  >();

  for (const period of yacht.checkInPeriods ?? []) {
    const minNights = positiveInt(period.minimalReservationDuration);

    for (const checkinWeekday of enabledWeekdays(period, "checkIn")) {
      for (const checkoutWeekday of enabledWeekdays(period, "checkOut")) {
        if (
          checkinWeekday === undefined &&
          checkoutWeekday === undefined &&
          minNights === undefined
        )
          continue;
        rules.set(`${checkinWeekday}|${checkoutWeekday}|${minNights}`, {
          checkinWeekday,
          checkoutWeekday,
          minNights,
          maxNights: undefined,
        });
      }
    }
  }

  return [...rules.values()];
}

function enabledWeekdays(
  period: JsonObject,
  direction: "checkIn" | "checkOut",
): (number | undefined)[] {
  const days = WEEKDAY_FLAGS.filter((day) => period[day[direction]] === true).map(
    (day) => day.weekday,
  );
  return days.length === 0 || days.length === WEEKDAY_FLAGS.length ? [undefined] : days;
}

type MediaRole = "main" | "layout" | "gallery";

/**
 * `pictures` is preferred over `picturesURL`: same URLs, but it flags which one is
 * the main shot and which the accommodation layout. Deduplication is not optional
 * here, because `mainPictureUrl` repeats an entry of the list almost every time.
 *
 * The URLs are model-scoped (`/rest/yachtModel/100239/pictures/main.jpg`), so
 * sisterships legitimately share media; that is a property of the vendor's data,
 * not a bug to be filtered out.
 */
function mediaOf(yacht: RestYacht) {
  const media: { externalUrl: string; role: MediaRole; sortOrder: number }[] = [];
  const seen = new Set<string>();

  const push = (value: JsonField, role: MediaRole) => {
    const url = text(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    media.push({ externalUrl: url, role, sortOrder: media.length });
  };

  push(yacht.mainPictureUrl, "main");

  const pictures = yacht.pictures ?? [];
  for (const picture of pictures) {
    push(picture.src, pictureRole(picture));
  }

  if (pictures.length === 0) {
    // No roles and no timestamps in this form, so everything lands as gallery.
    for (const url of yacht.picturesURL ?? []) {
      push(url, "gallery");
    }
  }

  return media;
}

function pictureRole(picture: { mainPicture?: boolean; layoutPicture?: boolean }): MediaRole {
  if (picture.layoutPicture === true) return "layout";
  return picture.mainPicture === true ? "main" : "gallery";
}

function textsOf(yacht: RestYacht) {
  const texts: { kind: "description" | "notes"; locale: string; value: string }[] = [];

  for (const source of TEXT_SOURCES) {
    // SAFETY: TEXT_SOURCES names keys of RestYacht; the record view only exists
    // because those names are read dynamically rather than as literals.
    const record = yacht as JsonObject;
    const locales = Object.entries(toLocaleMap(record[source.intText]));

    if (locales.length > 0) {
      for (const [locale, value] of locales) {
        const plain = stripHtml(value);
        if (plain !== undefined) texts.push({ kind: source.kind, locale, value: plain });
      }
      continue;
    }

    const plain = stripHtml(text(record[source.plain]));
    if (plain !== undefined) {
      texts.push({ kind: source.kind, locale: UNLOCALIZED_TEXT_LOCALE, value: plain });
    }
  }

  return texts;
}

/** Recorded periods use `periodFrom`/`periodTo`; `dateFrom`/`dateTo` is the PDF's spelling. */
function oneWayRulesOf(yacht: RestYacht) {
  const periods = yacht.oneWayPeriods;
  if (!Array.isArray(periods)) return [];

  const rules: { startDate: string; endDate: string; isOneWay: boolean }[] = [];
  for (const record of periods) {
    const from = text(record.periodFrom) ?? text(record.dateFrom);
    const to = text(record.periodTo) ?? text(record.dateTo);
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

interface EuminiaRating {
  rating?: number;
  reviewCount?: number;
}

/**
 * Euminia scores, the vendor's third-party review aggregate. The structure is
 * absent for an unrated yacht, and absent must stay absent: a listing nobody has
 * rated is not a listing rated zero.
 *
 * Only `total` and `reviews` have a canonical home; the sub-scores stay in the
 * retained raw payload. A score that will not parse, or that lands outside the
 * 0..5 the vendor scores on, is dropped rather than clamped, and the count is
 * dropped with it -- a count with no score renders as "0 (6 reviews)".
 */
function euminiaOf(yacht: RestYacht): EuminiaRating {
  const rating = decimalOf(yacht.euminia?.total);
  if (rating === undefined || rating < 0 || rating > 5) return {};

  const reviews = intOf(decimalOf(yacht.euminia?.reviews));
  return { rating, reviewCount: reviews !== undefined && reviews >= 0 ? reviews : undefined };
}

/**
 * Production sends "4,00" where the vendor PDF prints "4.83", and `parseFloat`
 * on the comma form returns 4 -- a silent understatement of every rating, not an
 * error anyone would see.
 */
function decimalOf(value: JsonField): number | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* ----------------------------------------------------------------- helpers */

/** English if the vendor has it, otherwise the first locale it does have. */
function name(value: JsonField): string | undefined {
  const locales = toLocaleMap(value);
  return locales.en ?? Object.values(locales)[0];
}

/**
 * Zero is how the vendor writes a tank it has not measured, on the yacht and on
 * the model alike, so it falls through to the model and then to unset rather than
 * publishing a boat that carries no water.
 */
function capacityOf(...candidates: JsonField[]): number | undefined {
  for (const candidate of candidates) {
    const parsed = intOf(candidate);
    if (parsed !== undefined && parsed > 0) return parsed;
  }
  return undefined;
}

/**
 * The priced extras behind the yacht's two paid detail sections.
 *
 * `seasonSpecificData` repeats the operator's whole extras list once per base it
 * sails the yacht from, at that base's prices, so the home base's entries are the
 * ones this listing sells at. When no entry names the home base the unscoped list
 * is used rather than publishing nothing.
 *
 * Prices differ between seasons, so one entry per extra survives and the latest
 * season wins: an operator that has published next year's price has superseded
 * this year's.
 */
function extrasOf(yacht: RestYacht, currency: string, context: ExtraNaming): CanonicalExtra[] {
  const homeBaseId = yacht.baseId === undefined ? undefined : String(yacht.baseId);
  const seasons = yacht.seasonSpecificData ?? [];
  const atHomeBase = seasons.filter(
    (season) => season.baseId !== undefined && String(season.baseId) === homeBaseId,
  );
  const relevant = atHomeBase.length > 0 ? atHomeBase : seasons;

  const chosen = new Map<string, { seasonId: number; extra: CanonicalExtra }>();
  const consider = (seasonId: number, extra: CanonicalExtra | null) => {
    if (extra === null) return;
    const key = `${extra.kind}:${extra.externalId}`;
    const held = chosen.get(key);
    if (held === undefined || seasonId > held.seasonId) chosen.set(key, { seasonId, extra });
  };

  for (const season of relevant) {
    const scope = {
      externalSeasonId: season.seasonId === undefined ? undefined : String(season.seasonId),
      externalBaseId: season.baseId === undefined ? undefined : String(season.baseId),
    };
    const seasonId = season.seasonId ?? 0;

    for (const service of season.services ?? []) {
      consider(seasonId, serviceExtraOf(service, currency, scope, context));
    }
    for (const item of season.additionalYachtEquipment ?? []) {
      consider(seasonId, equipmentExtraOf(item, currency, scope, context));
    }
  }

  return [...chosen.values()].map((entry) => entry.extra);
}

type ExtraScope = { externalSeasonId: string | undefined; externalBaseId: string | undefined };

function serviceExtraOf(
  item: NonNullable<NonNullable<RestYacht["seasonSpecificData"]>[number]["services"]>[number],
  fallbackCurrency: string,
  scope: ExtraScope,
  context: ExtraNaming,
): CanonicalExtra | null {
  const externalId = String(item.serviceId);
  const label = context.serviceNameById.get(externalId);
  // An extra we cannot name must not be sold: the buyer would be asked to approve
  // a line reading "Service 934251". The `services` catalogue is the only source
  // of these labels, and it does not cover every id a yacht references.
  if (label === undefined) return null;
  if (item.availableOnAgencyPortal === false) return null;

  const priceCurrency = currencyOf(item.currency, fallbackCurrency);
  const priceMinor = minorOf(item.price ?? item.amount, priceCurrency);
  if (priceMinor === undefined) return null;

  const extra: CanonicalExtra = {
    kind: "service",
    externalId,
    name: label,
    obligatory: item.obligatory === true,
    priceMinor,
    priceCurrency,
    priceMeasure: measureOf(item.priceMeasureId, context),
    calculationType: text(item.calculationType),
    onRequestOnly: item.onRequestOnly === true,
    ...scope,
  };

  // Only a name the patterns recognise sets a role; the rest stay plain extras.
  const crewRole = crewRoleOf(label);
  if (crewRole !== undefined) extra.crewRole = crewRole;

  return extra;
}

function equipmentExtraOf(
  item: NonNullable<
    NonNullable<RestYacht["seasonSpecificData"]>[number]["additionalYachtEquipment"]
  >[number],
  fallbackCurrency: string,
  scope: ExtraScope,
  context: ExtraNaming,
): CanonicalExtra | null {
  const externalId = String(item.equipmentId);
  const label = context.equipmentNameById.get(externalId);
  if (label === undefined) return null;
  if (item.availableOnAgencyPortal === false) return null;

  const priceCurrency = currencyOf(item.currency, fallbackCurrency);
  const priceMinor = minorOf(item.price ?? item.amount, priceCurrency);
  if (priceMinor === undefined) return null;

  return {
    kind: "equipment",
    externalId,
    name: label,
    // Additional equipment carries no obligatory flag; it is an opt-in add-on.
    obligatory: false,
    priceMinor,
    priceCurrency,
    priceMeasure: measureOf(item.priceMeasureId, context),
    calculationType: text(item.calculationType),
    onRequestOnly: false,
    ...scope,
  };
}

/**
 * Which crew role a service's name says it is, if any.
 *
 * NauSYS marks nothing as crew: a skipper is a priced service like a paddleboard,
 * and the only signal is what the operator called it. So this reads the name, and
 * an unrecognised one stays unset rather than being guessed into a role — quoting
 * a customer for a skipper they did not ask for is worse than not offering crew.
 *
 * Ordered because "skippered cook" must not match `skipper` first; the most
 * specific patterns are tried before the general ones. Reviewed against the
 * services our own account returns, so it will need revisiting for an operator who
 * names crew in a language this does not cover.
 */
const CREW_ROLE_PATTERNS: { role: "skipper" | "hostess" | "cook"; pattern: RegExp }[] = [
  { role: "cook", pattern: /\b(cook|chef)\b/i },
  { role: "hostess", pattern: /\b(hostess|host|stewardess)\b/i },
  { role: "skipper", pattern: /\b(skipper|captain)\b/i },
];

function crewRoleOf(name: string): "skipper" | "hostess" | "cook" | undefined {
  return CREW_ROLE_PATTERNS.find((entry) => entry.pattern.test(name))?.role;
}

function measureOf(priceMeasureId: number | undefined, context: ExtraNaming): string | undefined {
  return priceMeasureId === undefined
    ? undefined
    : context.priceMeasureById.get(String(priceMeasureId));
}

/** The currency the operator prices this season in; the deposit names its own. */
function seasonCurrencyOf(yacht: RestYacht): string | undefined {
  for (const season of yacht.seasonSpecificData ?? []) {
    for (const price of season.prices ?? []) {
      const code = text(price.currency);
      if (code !== undefined) return code;
    }
  }
  return undefined;
}

/**
 * Amounts stay strings until they are integers of minor units; `RestYacht` sends
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
