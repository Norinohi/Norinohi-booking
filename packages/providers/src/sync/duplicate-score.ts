/*
 * Scoring for cross-provider look-alikes.
 *
 * The SQL that proposes a pair only gates on model + build year, which two sister
 * ships in different countries also pass — so on its own it says almost nothing, and
 * a fixed confidence made the whole queue one undifferentiated pile. What actually
 * settles a pair is the boat's own name, then where it is based, then the numbers.
 * This turns those agreements into a score the reviewer can sort and filter by.
 *
 * Weights sum to 1 when everything agrees. They are deliberately blunt: the number
 * is a queue order, not a probability, and nothing here merges anything by itself.
 */

/** The gate itself: same model, same build year, two different providers. */
const BASE_WEIGHT = 0.3;

const WEIGHTS = {
  name: 0.3,
  base: 0.12,
  /* Only when the bases themselves disagree — a weaker version of the same evidence. */
  area: 0.06,
  length: 0.08,
  cabins: 0.06,
  berths: 0.06,
  heads: 0.04,
  builder: 0.02,
  operator: 0.02,
} as const;

export type DuplicateCriterion = keyof typeof WEIGHTS;

/** Two hulls of the same model are within a few centimetres of each other. */
const LENGTH_TOLERANCE_M = 0.1;

/*
 * `base` rows are keyed by location and name, and two providers spell the same marina
 * differently often enough that comparing ids alone would call almost every pair a
 * disagreement. Coordinates are the honest test: the same berth to within a few
 * kilometres, and the same charter area to within an hour's sail.
 */
const SAME_BERTH_KM = 5;
const SAME_AREA_KM = 60;
const EARTH_RADIUS_KM = 6371;

/** Below this a stripped title is initials or a stray year, not a boat's name. */
const MIN_NAME_LENGTH = 3;

export type DuplicateSideFacts = {
  title: string;
  lengthM: number | null;
  cabins: number | null;
  berths: number | null;
  heads: number | null;
  homeBaseId: string | null;
  locationId: string | null;
  /** The home base's coordinates, when the provider gave the marina any. */
  lat: number | null;
  lng: number | null;
  builderId: string | null;
  operatorName: string | null;
};

export type DuplicatePairFacts = {
  /** Shared by both sides: the pair is gated on one model id. */
  modelName: string | null;
  a: DuplicateSideFacts;
  b: DuplicateSideFacts;
};

/**
 * What the matcher recorded, as the review screen reads it back. `agreed` and
 * `differed` name the criteria that were comparable on both sides; a field one
 * side does not carry is in neither, because silence is not disagreement.
 */
export type DuplicateSignals = {
  matchedOn: DuplicateMatchKind;
  score: number;
  agreed: DuplicateCriterion[];
  differed: DuplicateCriterion[];
  /** The stripped boat name when both sides agreed on one, for the audit trail. */
  name: string | null;
};

export type DuplicateMatchKind = "name+model+year" | "base+model+year" | "model+year";

export type DuplicateScore = {
  /** 0-1, rounded to the four decimals the column stores. */
  confidence: number;
  signals: DuplicateSignals;
};

/**
 * Providers ship the model in the title — "Airbender Sun Odyssey 449". Removing it
 * leaves the name the boat actually carries, which is the one thing two feeds for
 * the same hull nearly always agree on and two sister ships never do.
 */
export function yachtNameKey(title: string, modelName: string | null): string | null {
  const withoutModel = modelName
    ? title.toLowerCase().replaceAll(modelName.toLowerCase(), " ")
    : title.toLowerCase();
  const key = withoutModel.replace(/[^\p{Letter}\p{Number}]+/gu, "");
  return key.length >= MIN_NAME_LENGTH ? key : null;
}

export function scoreDuplicatePair(facts: DuplicatePairFacts): DuplicateScore {
  const nameA = yachtNameKey(facts.a.title, facts.modelName);
  const nameB = yachtNameKey(facts.b.title, facts.modelName);

  const agreed: DuplicateCriterion[] = [];
  const differed: DuplicateCriterion[] = [];

  const judge = (criterion: DuplicateCriterion, verdict: boolean | null) => {
    if (verdict === null) return;
    (verdict ? agreed : differed).push(criterion);
  };

  const nameMatch = nameA === null || nameB === null ? null : nameA === nameB;
  judge("name", nameMatch);

  const distanceKm = baseDistanceKm(facts.a, facts.b);
  const sameBase = sameBerth(facts, distanceKm);
  judge("base", sameBase);
  /* Only worth saying when the berths themselves disagree; otherwise it is the same fact twice. */
  if (sameBase !== true) judge("area", sameArea(facts, distanceKm));

  judge("length", within(facts.a.lengthM, facts.b.lengthM, LENGTH_TOLERANCE_M));
  judge("cabins", compare(facts.a.cabins, facts.b.cabins));
  judge("berths", compare(facts.a.berths, facts.b.berths));
  judge("heads", compare(facts.a.heads, facts.b.heads));
  judge("builder", compare(facts.a.builderId, facts.b.builderId));
  judge(
    "operator",
    compare(normalizeName(facts.a.operatorName), normalizeName(facts.b.operatorName)),
  );

  const earned = agreed.reduce((total, criterion) => total + WEIGHTS[criterion], BASE_WEIGHT);
  const confidence = Math.round(Math.min(earned, 1) * 10_000) / 10_000;

  return {
    confidence,
    signals: {
      matchedOn: matchKind(nameMatch === true, sameBase === true),
      score: confidence,
      agreed,
      differed,
      name: nameMatch === true ? nameA : null,
    },
  };
}

/**
 * Whether a scored pair is worth putting in front of a reviewer.
 *
 * The SQL gate pairs every hull of a model with every other of the same year, so a
 * fleet of eight identical Bavarias proposes 28 pairs — and the queue filled with
 * sister ships nobody would ever merge. A pair whose boats carry different names and
 * lie in different marinas is one of those: two facts disagree and only the model and
 * the year agree, which is what a sister ship is.
 *
 * Deliberately not a score threshold. A name match can still score below any cutoff
 * worth setting when the rest of the record is thin, and that is the one signal never
 * worth discarding. Silence is not disagreement either: a title that is nothing but
 * the model leaves the name unreadable, and those pairs stay.
 */
export function worthReviewing(signals: DuplicateSignals): boolean {
  return !(signals.matchedOn === "model+year" && signals.differed.includes("name"));
}

/**
 * The headline the review queue filters on: what the pair was actually matched by,
 * as against the gate it merely passed.
 */
function matchKind(nameMatch: boolean, sameBase: boolean): DuplicateMatchKind {
  if (nameMatch) return "name+model+year";
  if (sameBase) return "base+model+year";
  return "model+year";
}

/**
 * Same marina: the same base row, or two rows the providers placed within a few
 * kilometres of each other. Null when neither test can be run.
 */
function sameBerth(facts: DuplicatePairFacts, distanceKm: number | null): boolean | null {
  if (facts.a.homeBaseId !== null && facts.a.homeBaseId === facts.b.homeBaseId) return true;
  if (distanceKm !== null) return distanceKm <= SAME_BERTH_KM;
  return compare(facts.a.homeBaseId, facts.b.homeBaseId);
}

function sameArea(facts: DuplicatePairFacts, distanceKm: number | null): boolean | null {
  if (distanceKm !== null) return distanceKm <= SAME_AREA_KM;
  return compare(facts.a.locationId, facts.b.locationId);
}

function baseDistanceKm(a: DuplicateSideFacts, b: DuplicateSideFacts): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const chord =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(Math.sqrt(chord), 1));
}

/** Null when either side is silent: an absent value is not a disagreement. */
function compare<T>(left: T | null, right: T | null): boolean | null {
  return left === null || right === null ? null : left === right;
}

function within(left: number | null, right: number | null, tolerance: number): boolean | null {
  return left === null || right === null ? null : Math.abs(left - right) <= tolerance;
}

function normalizeName(value: string | null): string | null {
  if (value === null) return null;
  const key = value.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
  return key.length > 0 ? key : null;
}
