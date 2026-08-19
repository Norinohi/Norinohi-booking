/*
 * The model without its cabin configuration.
 *
 * NauSYS files the layout into the model name, so one hull arrives as "Lagoon 42 - 4 + 2 cab.",
 * "Lagoon 42 - 3 cab." and "Lagoon 42 - 4 cab.". Grouped by name they are three models; on the
 * staging catalogue that turned 109 listings into 92 distinct models, none of them with enough
 * boats behind it to deserve a page.
 *
 * A rule rather than a curated map, unlike `category-groups.ts`: the vendor list is open-ended
 * and grows with the fleet, while the suffix follows one shape. The pattern is deliberately
 * narrow — it fires only on a trailing cabin count, so "Bavaria C46 ELECTRIC" and
 * "Sun Odyssey 54 DS" are left exactly as written.
 */
const CABIN_SUFFIX = /\s*[-–]\s*\d+\s*(?:\+\s*\d+\s*)?cab\.?\s*$/i;

/** The vendor model name with a trailing cabin configuration removed, trimmed of nothing else. */
export function canonicalModelName(name: string): string | null {
  const stripped = name.replace(CABIN_SUFFIX, "").trim();
  return stripped && stripped !== name ? stripped : null;
}
