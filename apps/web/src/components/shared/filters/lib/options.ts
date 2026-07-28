export type Option = { value: string; label: string };

export function labelOf(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Keeps a selection in option order, so comparing it against a default never depends on click order. */
export function orderedValues(options: Option[], selected: string[]): string[] {
  const picked = new Set(selected);
  return options.filter((option) => picked.has(option.value)).map((option) => option.value);
}

export const COUNTRIES: Option[] = [
  { value: "egypt", label: "Egypt" },
  { value: "morocco", label: "Morocco" },
  { value: "croatia", label: "Croatia" },
  { value: "spain", label: "Spain" },
  { value: "france", label: "France" },
  { value: "italy", label: "Italy" },
  { value: "portugal", label: "Portugal" },
  { value: "greece", label: "Greece" },
  { value: "norway", label: "Norway" },
  { value: "turkey", label: "Turkey" },
  { value: "montenegro", label: "Montenegro" },
];

export const SAILING_AREAS: Option[] = [
  { value: "dalmatia", label: "Dalmatia" },
  { value: "istria", label: "Istria" },
  { value: "kvarner", label: "Kvarner" },
];

export const CHARTER_COMPANIES: Option[] = [
  { value: "sunsail", label: "Sunsail" },
  { value: "dream-yacht", label: "Dream Yacht" },
  { value: "navigare", label: "Navigare" },
];

export const MARINAS: Option[] = [
  { value: "split", label: "Marina Split" },
  { value: "kastela", label: "Marina Kaštela" },
  { value: "trogir", label: "Marina Trogir" },
];

export const DURATIONS: Option[] = [
  { value: "7", label: "7 days (recommended)" },
  { value: "3", label: "3 days" },
  { value: "10", label: "10 days" },
  { value: "14", label: "14 days" },
];

export const DATE_FLEXIBILITY: Option[] = [
  { value: "on-day", label: "On day" },
  { value: "1-3-days", label: "In 1–3 days" },
  { value: "1-week", label: "In 1 week" },
  { value: "2-weeks", label: "In 2 weeks" },
  { value: "1-month", label: "In 1 month" },
];

export const BOAT_TYPES: Option[] = [
  { value: "sailing-yacht", label: "Sailing Yacht" },
  { value: "catamaran", label: "Catamaran" },
  { value: "gulet", label: "Gulet" },
  { value: "motor-yacht", label: "Motor Yacht" },
  { value: "power-catamaran", label: "Power Catamaran" },
  { value: "sailboat", label: "Sailboat" },
  { value: "motor-boat", label: "Motor Boat" },
];

export const MODELS: Option[] = [
  { value: "bavaria", label: "Bavaria" },
  { value: "beneteau", label: "Beneteau" },
  { value: "jeanneau", label: "Jeanneau" },
  { value: "lagoon", label: "Lagoon" },
];

export const CREWS: Option[] = [
  { value: "full-crew", label: "Full crew" },
  { value: "skipper", label: "Skipper only" },
  { value: "bareboat", label: "Bareboat" },
];

export const MAINSAIL_TYPES: Option[] = [
  { value: "classic", label: "Classic" },
  { value: "furling", label: "Furling" },
  { value: "lazy-bag", label: "Lazy bag" },
];

export const EQUIPMENT: Option[] = [
  { value: "air-conditioning", label: "Air conditioning" },
  { value: "generator", label: "Generator" },
  { value: "bow-thruster", label: "Bow thruster" },
  { value: "wifi", label: "Wi-Fi" },
];

export const LENGTH_UNITS: Option[] = [
  { value: "ft", label: "ft" },
  { value: "m", label: "m" },
];

const YEARS = ["2015", "2018", "2020", "2022", "2024", "2025"];

export const YEARS_FROM: Option[] = [
  { value: "any", label: "Year" },
  ...YEARS.map((year) => ({ value: year, label: year })),
];

export const YEARS_TO: Option[] = YEARS_FROM;
