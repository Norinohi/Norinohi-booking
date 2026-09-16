import type {
  DuplicateCandidate,
  DuplicateDetailListing,
  DuplicateSide,
  DuplicateSignals,
} from "../types";

/**
 * One row of the side-by-side comparison. `a`/`b` are already display strings so the two
 * panels render identical rows in identical order; `differs` is computed from the raw
 * values, which is what makes a mismatch spottable at a glance.
 */
export type ComparisonRow<Key extends string = ComparisonKey> = {
  key: Key;
  a: string;
  b: string;
  differs: boolean;
};

export type ComparisonKey =
  | "provider"
  | "externalId"
  | "status"
  | "matchStatus"
  | "operator"
  | "model"
  | "year"
  | "length"
  | "cabins"
  | "berths"
  | "base"
  | "location";

type RawValue = string | number | null;

type FieldSpec = {
  key: ComparisonKey;
  read: (side: DuplicateSide) => RawValue;
  /**
   * Whether a mismatch is evidence. Provider, provider id and match status differ on
   * every cross-provider pair by construction, so highlighting them would be noise.
   */
  compare: boolean;
};

const FIELDS: readonly FieldSpec[] = [
  { key: "provider", read: (side) => side.provider, compare: false },
  { key: "externalId", read: (side) => side.externalYachtId, compare: false },
  { key: "status", read: (side) => side.listing?.status ?? null, compare: true },
  { key: "matchStatus", read: (side) => side.matchStatus, compare: false },
  { key: "operator", read: (side) => side.listing?.operatorName ?? null, compare: true },
  { key: "model", read: (side) => side.listing?.modelName ?? null, compare: true },
  { key: "year", read: (side) => side.listing?.yearBuilt ?? null, compare: true },
  { key: "length", read: (side) => side.listing?.lengthM ?? null, compare: true },
  { key: "cabins", read: (side) => side.listing?.cabins ?? null, compare: true },
  { key: "berths", read: (side) => side.listing?.berths ?? null, compare: true },
  { key: "base", read: (side) => side.listing?.baseName ?? null, compare: true },
  { key: "location", read: (side) => side.listing?.locationName ?? null, compare: true },
];

export const EMPTY_VALUE = "—";

/**
 * Builds both panels' rows in one pass. `format` turns a raw value into display text and is
 * supplied by the component, which owns the translations.
 */
export function comparisonRows(
  candidate: DuplicateCandidate,
  format: (key: ComparisonKey, value: RawValue) => string,
): ComparisonRow[] {
  return FIELDS.map(({ key, read, compare }) => {
    const a = read(candidate.sideA);
    const b = read(candidate.sideB);
    return {
      key,
      a: format(key, a),
      b: format(key, b),
      // Two missing values are not a mismatch; one missing value is.
      differs: compare && a !== b,
    };
  });
}

/**
 * The matcher's verdict in the shape the card renders: which rule carried the pair and
 * which criteria it compared. Null for a candidate proposed before the matcher recorded
 * any of that, which `formatSignals` still prints as raw key/value text.
 */
export function matchSignals(signals: DuplicateSignals | null): {
  matchedOn: string | null;
  agreed: string[];
  differed: string[];
} | null {
  if (!signals) return null;
  if (signals.matchedOn === undefined && signals.agreed === undefined) return null;

  return {
    matchedOn: signals.matchedOn ?? null,
    agreed: signals.agreed ?? [],
    differed: signals.differed ?? [],
  };
}

/** `{ matchedOn: "model+yearBuilt", yearBuilt: 2019 }` → `matchedOn: model+yearBuilt, yearBuilt: 2019`. */
export function formatSignals(signals: DuplicateSignals | null): string | null {
  if (!signals) return null;

  const parts = Object.entries(signals)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);

  return parts.length > 0 ? parts.join(", ") : null;
}

/* ------------------------------------------- the on-demand full comparison */

export type DetailKey =
  | "category"
  | "builder"
  | "crewType"
  | "beam"
  | "draft"
  | "heads"
  | "showers"
  | "engines"
  | "enginePower"
  | "fuelType"
  | "fuelCapacity"
  | "waterCapacity"
  | "propulsion"
  | "steering"
  | "sail"
  | "deposit"
  | "depositInsurance"
  | "pets"
  | "currency"
  | "rating"
  | "reviews"
  | "freshness"
  | "updated";

export type DetailRow = ComparisonRow<DetailKey>;

type DetailRawValue = string | number | boolean | null;

type DetailFieldSpec = {
  key: DetailKey;
  /** Decides the highlight only; the display string comes from the caller's `format`. */
  read: (listing: DuplicateDetailListing) => DetailRawValue;
  compare: boolean;
};

const DETAIL_FIELDS: readonly DetailFieldSpec[] = [
  { key: "category", read: (listing) => listing.categoryName, compare: true },
  { key: "builder", read: (listing) => listing.builderName, compare: true },
  { key: "crewType", read: (listing) => listing.crewType, compare: true },
  { key: "beam", read: (listing) => listing.beamM, compare: true },
  { key: "draft", read: (listing) => listing.draftM, compare: true },
  { key: "heads", read: (listing) => listing.heads, compare: true },
  { key: "showers", read: (listing) => listing.showers, compare: true },
  { key: "engines", read: (listing) => listing.engines, compare: true },
  { key: "enginePower", read: (listing) => listing.enginePower, compare: true },
  { key: "fuelType", read: (listing) => listing.fuelType, compare: true },
  { key: "fuelCapacity", read: (listing) => listing.fuelCapacity, compare: true },
  { key: "waterCapacity", read: (listing) => listing.waterCapacity, compare: true },
  { key: "propulsion", read: (listing) => listing.propulsionType, compare: true },
  { key: "steering", read: (listing) => listing.steeringType, compare: true },
  { key: "sail", read: (listing) => listing.sailType, compare: true },
  {
    key: "deposit",
    // Amount and currency together: the same number in two currencies is a mismatch.
    read: (listing) =>
      listing.securityDepositMinor === null
        ? null
        : `${listing.securityDepositMinor} ${listing.securityDepositCurrency ?? ""}`,
    compare: true,
  },
  { key: "depositInsurance", read: (listing) => listing.depositInsuranceIncluded, compare: true },
  { key: "pets", read: (listing) => listing.petsAllowed, compare: true },
  { key: "currency", read: (listing) => listing.defaultCurrency, compare: true },
  /* Each provider ships its own review aggregate, so a difference says nothing. */
  { key: "rating", read: (listing) => listing.providerRating, compare: false },
  { key: "reviews", read: (listing) => listing.providerReviewCount, compare: false },
  { key: "freshness", read: (listing) => listing.freshnessAt, compare: false },
  { key: "updated", read: (listing) => listing.updatedAt, compare: false },
];

/**
 * The extended rows, built like `comparisonRows` but reading whole listings: the deposit
 * needs its currency to be formatted, which a bare raw value cannot carry.
 */
export function detailRows(
  a: DuplicateDetailListing | null,
  b: DuplicateDetailListing | null,
  format: (key: DetailKey, listing: DuplicateDetailListing) => string,
): DetailRow[] {
  return DETAIL_FIELDS.map(({ key, read, compare }) => ({
    key,
    a: a ? format(key, a) : EMPTY_VALUE,
    b: b ? format(key, b) : EMPTY_VALUE,
    differs: compare && a !== null && b !== null && read(a) !== read(b),
  }));
}
