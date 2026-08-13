import type { DuplicateCandidate, DuplicateSide } from "../types";

/**
 * One row of the side-by-side comparison. `a`/`b` are already display strings so the two
 * panels render identical rows in identical order; `differs` is computed from the raw
 * values, which is what makes a mismatch spottable at a glance.
 */
export type ComparisonRow = {
  key: ComparisonKey;
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

/** `{ matchedOn: "model+yearBuilt", yearBuilt: 2019 }` → `matchedOn: model+yearBuilt, yearBuilt: 2019`. */
export function formatSignals(signals: Record<string, unknown> | null): string | null {
  if (!signals) return null;

  const parts = Object.entries(signals)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`);

  return parts.length > 0 ? parts.join(", ") : null;
}
