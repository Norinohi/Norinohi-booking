import type { z } from "zod";

import { parseNausysDate } from "../shared/dates";
import { stripHtml } from "../shared/html-text";
import { CONTENT_LOCALES } from "@yacht-charter/db/search/localize";

import { toLocaleMap } from "../shared/international-text";
import { decimalStringToMinor } from "../shared/money";
import { mergeYachtTitle } from "../shared/yacht-title";
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
  /* The same two lists again, in the locales the site serves. Keyed by vendor id rather than
     by label because that is what the extras on a yacht reference. */
  const equipmentTranslationsById = localeMapsById(equipment);
  const serviceTranslationsById = localeMapsById(services);
  const depositInsuranceServiceIds = new Set(
    services.flatMap((item) => (item.depositInsurance === true ? [String(item.id)] : [])),
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
        depositInsuranceServiceIds,
        equipmentTranslationsById,
        serviceTranslationsById,
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
      translations: translations(item.name),
    })),
    regions: regions.map((item) => ({
      externalId: String(item.id),
      externalCountryId: String(item.countryId),
      name: name(item.name) ?? `Region ${item.id}`,
      translations: translations(item.name),
    })),
    locations: locations.map((item) => ({
      externalId: String(item.id),
      externalRegionId: String(item.regionId),
      name: name(item.name) ?? `Location ${item.id}`,
      translations: translations(item.name),
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
      translations: translations(item.name),
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
      translations: translations(item.name),
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
  /** Services that lower the deposit instead of adding something to the charter. */
  depositInsuranceServiceIds: Set<string>;
  equipmentTranslationsById: Map<string, Record<string, string>>;
  serviceTranslationsById: Map<string, Record<string, string>>;
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
  /*
   * Shared with Booking Manager. This used to concatenate blindly, which named 142 boats in the
   * live catalogue things like "Sole Sole" - NauSYS records the model as the boat's own name for
   * one-off yachts - and baked the repeat into the slug.
   */
  const title = mergeYachtTitle(yacht.name, modelName) ?? `Yacht ${externalId}`;
  const currency = currencyOf(seasonCurrencyOf(yacht) ?? yacht.depositCurrency);
  const depositCurrency = currencyOf(yacht.depositCurrency ?? currency);

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
    name: yacht.name?.trim() || undefined,
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
      showers: capacityOf(yacht.showers),
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
    securityDepositMinor: minorOf(yacht.deposit, depositCurrency),
    /* Published only when it differs from the ordinary deposit, which is the vendor's rule. */
    securityDepositWhenInsuredMinor: minorOf(yacht.depositWhenInsured, depositCurrency),
    securityDepositCurrency: depositCurrency,
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
 * `dateFrom`/`dateTo` bound each period and are carried through to `season_start`/`season_end`,
 * because operators do change turnaround terms mid-season and do let the old ones lapse. This
 * used to drop them on the reading that every recorded period spans 1970 to 2099; production
 * disagrees. Yacht 29476220 publishes three: whole Saturday weeks to 04.05.2025, three nights
 * on any day for the four months after it, and whole Saturday weeks again to 2999. Flattening
 * those made the expired middle one law forever, so the card offered a three-night charter in
 * September 2026 that `freeYachts` refused while selling the surrounding week.
 *
 * A period that cannot be read as a date is kept without its bounds rather than dropped: the
 * turnaround day is the part customers are shown, and losing it entirely would open the
 * calendar wider than losing its season does.
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
      seasonStart: string | undefined;
      seasonEnd: string | undefined;
    }
  >();

  for (const period of yacht.checkInPeriods ?? []) {
    const minNights = positiveInt(period.minimalReservationDuration);
    const seasonStart = nausysDayOrUndefined(period.dateFrom);
    const seasonEnd = nausysDayOrUndefined(period.dateTo);

    for (const checkinWeekday of enabledWeekdays(period, "checkIn")) {
      for (const checkoutWeekday of enabledWeekdays(period, "checkOut")) {
        if (
          checkinWeekday === undefined &&
          checkoutWeekday === undefined &&
          minNights === undefined
        )
          continue;
        /* The season is part of the identity now: two periods that agree on the turnaround
           and differ only in when they apply are two rules, not one repeated. */
        rules.set(`${checkinWeekday}|${checkoutWeekday}|${minNights}|${seasonStart}|${seasonEnd}`, {
          checkinWeekday,
          checkoutWeekday,
          minNights,
          maxNights: undefined,
          seasonStart,
          seasonEnd,
        });
      }
    }
  }

  return [...rules.values()];
}

/** `dd.MM.yyyy` as an ISO day, or nothing at all where the vendor sent something unreadable. */
function nausysDayOrUndefined(value: JsonField): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    return parseNausysDate(raw);
  } catch {
    return undefined;
  }
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
 * The same reference name in the locales the site serves, or undefined when it ships none
 * of them.
 *
 * Every NauSYS reference list is `RestInternationalText`, so this data has always been on
 * the wire and `name()` above was throwing seventeen languages away to keep one. Recorded
 * responses carry es and de on 100% of equipment, services, categories, regions, locations
 * and countries; uk is absent, and ru is deliberately not served in its place.
 */
function localeMapsById(
  items: readonly { id: number; name: JsonField }[],
): Map<string, Record<string, string>> {
  return new Map(
    items.flatMap((item) => {
      const served = translations(item.name);
      return served === undefined ? [] : [[String(item.id), served] as const];
    }),
  );
}

function translations(value: JsonField): Record<string, string> | undefined {
  const locales = toLocaleMap(value);
  const wanted = Object.entries(locales).filter(([locale]) =>
    CONTENT_LOCALES.some((served) => served === locale),
  );
  return wanted.length === 0 ? undefined : Object.fromEntries(wanted);
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

  type Candidate = { rank: ReturnType<typeof extraRank>; seasonId: number; extra: CanonicalExtra };
  const beats = (left: Candidate, right: Candidate): boolean => {
    if (left.rank.atHomeBase !== right.rank.atHomeBase) {
      return left.rank.atHomeBase > right.rank.atHomeBase;
    }
    if (left.rank.endsAt !== right.rank.endsAt) return left.rank.endsAt > right.rank.endsAt;
    return left.seasonId > right.seasonId;
  };

  const chosen = new Map<string, Candidate>();
  const consider = (seasonId: number, extra: CanonicalExtra | null) => {
    if (extra === null) return;
    const key = `${extra.kind}:${extra.externalId}`;
    const candidate: Candidate = { rank: extraRank(extra, homeBaseId), seasonId, extra };
    const held = chosen.get(key);
    if (held === undefined || beats(candidate, held)) chosen.set(key, candidate);
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

/** Everything the vendor says about when this row applies, in our own words. */
type ExtraConditions = Pick<
  CanonicalExtra,
  | "seasonStart"
  | "seasonEnd"
  | "validNightsFrom"
  | "validNightsTo"
  | "validForBaseIds"
  | "minimumPriceMinor"
>;

/**
 * The row's own conditions, which the vendor states per price rather than per extra.
 *
 * `minDuration`/`maxDuration` are days, and our nights are one fewer: the vendor counts the
 * calendar days the boat is held, the way its own crew-list dates do. A seven-night charter
 * runs eight days, so a row for a "7 to 13 day" extra covers six to twelve nights.
 *
 * `validMinPax`/`validMaxPax` are read and dropped on purpose. Nothing that displays a
 * catalogue extra knows the party size -- the card is per listing and the checkout prices
 * through the vendor -- so storing them would be a column nobody could honestly consult.
 */
function conditionsOf(item: ExtraPriceRow, currency: string): ExtraConditions {
  const conditions: ExtraConditions = {};

  const from = nausysDayOrUndefined(item.validPeriodFrom);
  const to = nausysDayOrUndefined(item.validPeriodTo);
  if (from !== undefined) conditions.seasonStart = from;
  if (to !== undefined) conditions.seasonEnd = to;

  const minNights = nightsOf(item.minDuration);
  const maxNights = nightsOf(item.maxDuration);
  if (minNights !== undefined) conditions.validNightsFrom = minNights;
  if (maxNights !== undefined) conditions.validNightsTo = maxNights;

  const bases = item.validForBases ?? [];
  if (bases.length > 0) conditions.validForBaseIds = bases.map((base) => String(base));

  const floor = minorOf(item.minimumPrice, currency);
  if (floor !== undefined && floor > 0) conditions.minimumPriceMinor = floor;

  return conditions;
}

/** The subset of both price rows this reads; the two schemas carry these fields alike. */
type ExtraPriceRow = {
  minDuration?: number;
  maxDuration?: number;
  validPeriodFrom?: JsonField;
  validPeriodTo?: JsonField;
  validForBases?: number[];
  minimumPrice?: string;
};

function nightsOf(days: number | undefined): number | undefined {
  if (days === undefined || !Number.isInteger(days) || days <= 0) return undefined;
  return days - 1;
}

/**
 * Which of an extra's rows we keep, given that only one may be stored per extra: the id space
 * is the vendor's and `provider_extra_catalogue` is keyed on it.
 *
 * A row that applies at the yacht's own base beats one that does not, because that is where
 * the charters we price start. Then the row whose window runs latest, which is how an expired
 * variant loses to a current one without this pure function needing to know today's date, and
 * the season id breaks what is left. The conditions ride along on whichever row wins, so a
 * reader can still drop it for a charter it does not cover.
 */
function extraRank(extra: CanonicalExtra, homeBaseId: string | undefined) {
  const bases = extra.validForBaseIds ?? [];
  const atHomeBase = bases.length === 0 || (homeBaseId !== undefined && bases.includes(homeBaseId));
  return { atHomeBase: atHomeBase ? 1 : 0, endsAt: extra.seasonEnd ?? "9999-12-31" };
}

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
  const rate = percentageOf(item);
  /* A percentage carries its rate instead of a price: `price` is 0.00 on those rows and
     `amount` is the rate, so reading either as money is wrong. See `percentageOf`. */
  /* `amount` is the field in use: the vendor deprecated `price` here in its favour (and
     `listPrice` on the equipment prices beside it), so the older one is only a fallback. */
  const priceMinor = rate === undefined ? minorOf(item.amount ?? item.price, priceCurrency) : 0;
  if (priceMinor === undefined) return null;

  const extra: CanonicalExtra = {
    kind: "service",
    ...percentageFields(rate, item.percentageCalculationType),
    externalId,
    name: label,
    translations: context.serviceTranslationsById.get(externalId),
    obligatory: item.obligatory === true,
    priceMinor,
    priceCurrency,
    priceMeasure: measureOf(item.priceMeasureId, context),
    calculationType: text(item.calculationType),
    payableInBase: payableInBaseOf(item.calculationType),
    onRequestOnly: item.onRequestOnly === true,
    ...(context.depositInsuranceServiceIds.has(externalId) ? { depositInsurance: true } : null),
    ...conditionsOf(item, priceCurrency),
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
  /* `amount` is the field in use: the vendor deprecated `price` here in its favour (and
     `listPrice` on the equipment prices beside it), so the older one is only a fallback. */
  const priceMinor = minorOf(item.amount ?? item.price, priceCurrency);
  if (priceMinor === undefined) return null;

  return {
    kind: "equipment",
    externalId,
    name: label,
    translations: context.equipmentTranslationsById.get(externalId),
    // Additional equipment carries no obligatory flag; it is an opt-in add-on.
    obligatory: false,
    priceMinor,
    priceCurrency,
    priceMeasure: measureOf(item.priceMeasureId, context),
    calculationType: text(item.calculationType),
    payableInBase: payableInBaseOf(item.calculationType),
    onRequestOnly: false,
    ...conditionsOf(item, priceCurrency),
    ...scope,
  };
}

/**
 * Where the operator collects an extra, read off the same field the quote reads.
 *
 * `payWhenFor` in quote.ts is the authority at booking time and throws on a literal it does
 * not know, which is right there: misreading it misstates what is owed today. A catalogue has
 * no such stake, so an unknown literal leaves this unset and the page simply says nothing
 * rather than guessing, and the two never disagree on the values both recognise.
 */
function payableInBaseOf(calculationType: JsonField): boolean | undefined {
  switch (text(calculationType)) {
    case "ADVANCE_PAYMENT":
      return false;
    case "SEPARATE_PAYMENT":
      return true;
    default:
      return undefined;
  }
}

/**
 * The rate on a fee the operator states as a share of the charter, or nothing.
 *
 * `amountIsPercentage` has been documented since the field was widened to four decimals in
 * May 2022, and we read neither it nor the rate beside it: the catalogue sends
 * `price: "0.00"` with `amount: "0.3500"`, so a mandatory 35% service charge was stored as a
 * price of zero and shown to customers as included in the charter.
 */
function percentageFields(rate: number | undefined, basis: JsonField) {
  if (rate === undefined) return {};

  const named = text(basis);
  return named === undefined ? { percentage: rate } : { percentage: rate, percentageBasis: named };
}

function percentageOf(item: {
  amountIsPercentage?: unknown;
  amount?: JsonField;
}): number | undefined {
  if (item.amountIsPercentage !== true) return undefined;

  const rate = Number(text(item.amount));
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
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
