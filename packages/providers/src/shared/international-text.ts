import { z } from "zod";

const TEXT_KEY_PATTERN = /^text([A-Za-z]{2})$/;

// Three NauSYS keys are country codes whose BCP 47 language tag differs. SE is
// the dangerous one: as a language tag it means Northern Sami, not Swedish, so
// passing it through would mislabel the text rather than merely miss it.
const LOCALE_OVERRIDES = new Map([
  ["si", "sl"],
  ["cz", "cs"],
  ["se", "sv"],
]);

export const defaultFallbackOrder = ["en", "hr", "de", "it", "sl"];

/** BCP 47 tag to display text. Only locales the provider actually sent appear. */
export type LocaleMap = Record<string, string>;

// A record parse rejects arrays, null and primitives, which is exactly the set
// of payloads that carry no locale text.
const internationalTextSchema = z.record(z.string(), z.unknown());

/** Blank text is indistinguishable from absent text for fallback purposes. */
const localeTextSchema = z.string().trim().min(1);

/**
 * `RestInternationalText` (`{ textEN, textDE, textHR, ... }`) to a locale map.
 * Missing, blank and non-string values are dropped rather than surfaced as
 * empty strings, so `pickText` can fall through to the next locale.
 */
export function toLocaleMap(text: unknown): LocaleMap {
  const payload = internationalTextSchema.safeParse(text);
  if (!payload.success) {
    return {};
  }

  const result: LocaleMap = {};
  for (const [key, value] of Object.entries(payload.data)) {
    const match = TEXT_KEY_PATTERN.exec(key);
    if (!match) {
      continue;
    }
    const trimmed = localeTextSchema.safeParse(value);
    if (!trimmed.success) {
      continue;
    }
    const code = (match[1] ?? "").toLowerCase();
    result[LOCALE_OVERRIDES.get(code) ?? code] = trimmed.data;
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
