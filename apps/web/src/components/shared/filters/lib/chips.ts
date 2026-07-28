import {
  BOAT_TYPES,
  CHARTER_COMPANIES,
  COUNTRIES,
  CREWS,
  DATE_FLEXIBILITY,
  EQUIPMENT,
  MAINSAIL_TYPES,
  MARINAS,
  MODELS,
  labelOf,
  type Option,
  SAILING_AREAS,
} from "./options";
import { DEFAULT_FILTERS, type FiltersState, isSameValue, type Range } from "./state";

export type FilterChip = { id: string; label: string; keys: (keyof FiltersState)[] };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const numberFmt = new Intl.NumberFormat("en-GB");

/** Two names then a counter, so a chip stays readable when many boxes are ticked. */
function optionLabels(options: Option[], values: string[], shown = 2): string {
  const labels = values.map((value) => labelOf(options, value));
  if (labels.length <= shown) return labels.join(", ");
  return `${labels.slice(0, shown).join(", ")} +${labels.length - shown}`;
}

function rangeLabel([from, to]: Range, unit = ""): string {
  return `${numberFmt.format(from)}–${numberFmt.format(to)}${unit}`;
}

type ChipDef = {
  id: string;
  keys: (keyof FiltersState)[];
  label: (state: FiltersState) => string;
};

const CHIP_DEFS: ChipDef[] = [
  {
    id: "country",
    keys: ["country"],
    label: (s) => `Country: ${optionLabels(COUNTRIES, s.country)}`,
  },
  {
    id: "sailingArea",
    keys: ["sailingArea"],
    label: (s) => `Sailing Area: ${optionLabels(SAILING_AREAS, s.sailingArea)}`,
  },
  {
    id: "charterCompany",
    keys: ["charterCompany"],
    label: (s) => `Charter Company: ${optionLabels(CHARTER_COMPANIES, s.charterCompany)}`,
  },
  { id: "marina", keys: ["marina"], label: (s) => `Marina: ${optionLabels(MARINAS, s.marina)}` },

  {
    id: "startDate",
    keys: ["startDate"],
    label: (s) => `Start: ${s.startDate ? dateFmt.format(s.startDate) : "—"}`,
  },
  { id: "duration", keys: ["duration"], label: (s) => `Duration: ${s.duration} days` },
  {
    id: "dateFlexibility",
    keys: ["dateFlexibility"],
    label: (s) => `Flexibility: ${labelOf(DATE_FLEXIBILITY, s.dateFlexibility)}`,
  },

  {
    id: "boatType",
    keys: ["boatType"],
    label: (s) => `Boat Type: ${optionLabels(BOAT_TYPES, s.boatType)}`,
  },
  { id: "model", keys: ["model"], label: (s) => `Model: ${optionLabels(MODELS, s.model)}` },
  { id: "crew", keys: ["crew"], label: (s) => `Crew: ${optionLabels(CREWS, s.crew)}` },
  {
    id: "mainsailType",
    keys: ["mainsailType"],
    label: (s) => `Mainsail: ${optionLabels(MAINSAIL_TYPES, s.mainsailType)}`,
  },
  {
    id: "equipment",
    keys: ["equipment"],
    label: (s) => `Equipment: ${optionLabels(EQUIPMENT, s.equipment)}`,
  },

  { id: "length", keys: ["length"], label: (s) => `Length: ${rangeLabel(s.length)}` },
  { id: "cabins", keys: ["cabins"], label: (s) => `Cabins: ${rangeLabel(s.cabins)}` },
  { id: "berths", keys: ["berths"], label: (s) => `Berths: ${rangeLabel(s.berths)}` },
  { id: "bathrooms", keys: ["bathrooms"], label: (s) => `Bathrooms: ${rangeLabel(s.bathrooms)}` },
  { id: "price", keys: ["price"], label: (s) => `Price: €${rangeLabel(s.price)}` },
  { id: "boatAge", keys: ["boatAge"], label: (s) => `Age: ${rangeLabel(s.boatAge, " years")}` },
  {
    id: "year",
    keys: ["yearFrom", "yearTo"],
    label: (s) =>
      `Year: ${s.yearFrom === "any" ? "any" : s.yearFrom}–${s.yearTo === "any" ? "any" : s.yearTo}`,
  },

  {
    id: "withoutAvailabilityConfirmation",
    keys: ["withoutAvailabilityConfirmation"],
    label: () => "Without availability confirmation",
  },
  {
    id: "underTemporaryBooking",
    keys: ["underTemporaryBooking"],
    label: () => "Under temporary booking",
  },
  { id: "depositInsurance", keys: ["depositInsurance"], label: () => "Deposit insurance" },
  { id: "petsAllowed", keys: ["petsAllowed"], label: () => "Pets allowed" },

  {
    id: "guestRating",
    keys: ["guestRating"],
    label: (s) => `Rating: ${rangeLabel(s.guestRating)}`,
  },
];

export function isFilterKeyActive(state: FiltersState, key: keyof FiltersState): boolean {
  return !isSameValue(state[key], DEFAULT_FILTERS[key]);
}

export function getFilterChips(state: FiltersState): FilterChip[] {
  return CHIP_DEFS.filter((def) => def.keys.some((key) => isFilterKeyActive(state, key))).map(
    (def) => ({ id: def.id, label: def.label(state), keys: def.keys }),
  );
}

export function clearFilterKeys(state: FiltersState, keys: (keyof FiltersState)[]): FiltersState {
  const next = { ...state };
  for (const key of keys) {
    (next as Record<string, unknown>)[key] = DEFAULT_FILTERS[key];
  }
  return next;
}
