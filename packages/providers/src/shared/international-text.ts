const TEXT_KEY_PATTERN = /^text([A-Za-z]{2})$/;

// Three NauSYS keys are country codes whose BCP 47 language tag differs. SE is
// the dangerous one: as a language tag it means Northern Sami, not Swedish, so
// passing it through would mislabel the text rather than merely miss it.
const LOCALE_OVERRIDES: Record<string, string> = { si: "sl", cz: "cs", se: "sv" };

export const defaultFallbackOrder = ["en", "hr", "de", "it", "sl"];

/**
 * `RestInternationalText` (`{ textEN, textDE, textHR, ... }`) to a locale map.
 * Missing, blank and non-string values are dropped rather than surfaced as
 * empty strings, so `pickText` can fall through to the next locale.
 */
export function toLocaleMap(text: unknown): Record<string, string> {
  if (typeof text !== "object" || text === null || Array.isArray(text)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(text)) {
    const match = TEXT_KEY_PATTERN.exec(key);
    if (!match || typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      continue;
    }
    const code = (match[1] ?? "").toLowerCase();
    result[LOCALE_OVERRIDES[code] ?? code] = trimmed;
  }
  return result;
}

export function pickText(
  text: unknown,
  locale: string,
  fallbackOrder: string[] = defaultFallbackOrder,
): string | null {
  const map = toLocaleMap(text);
  const requested = typeof locale === "string" ? locale.trim().toLowerCase() : "";
  const candidates = [requested, requested.split("-")[0] ?? "", ...fallbackOrder];

  for (const candidate of candidates) {
    const value = map[candidate.toLowerCase()];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}
