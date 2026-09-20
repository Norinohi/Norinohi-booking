import { z } from "zod";

/*
 * The languages the site serves, in one place for every workspace: the web routes, the API
 * enums, the seeds and the provider sync all read this. Adding a language starts here, then
 * needs its `apps/web/messages/<locale>` folder and its database labels.
 */
export const DEFAULT_LOCALE = "en";

/** Every locale but the default, whose text is the catalogue's own value rather than a row. */
export const TRANSLATED_LOCALES = [
  "es",
  "uk",
  "de",
  "fr",
  "pl",
  "it",
  "nl",
  "sv",
  "no",
  "da",
] as const;

export const SITE_LOCALES = [DEFAULT_LOCALE, ...TRANSLATED_LOCALES] as const;

export type SiteLocale = (typeof SITE_LOCALES)[number];

export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

export const siteLocaleSchema = z.enum(SITE_LOCALES);

export const translatedLocaleSchema = z.enum(TRANSLATED_LOCALES);

/** One `value` per locale, every locale required: Zod 4 treats an enum-keyed record as exhaustive. */
export function perSiteLocale<T extends z.ZodType>(value: T) {
  return z.record(siteLocaleSchema, value);
}

export function perTranslatedLocale<T extends z.ZodType>(value: T) {
  return z.record(translatedLocaleSchema, value);
}

/**
 * The same value under every locale key, typed as a full record.
 *
 * For the editors' blank panes and the like, so a screen's empty state follows the list rather
 * than restating it. `make` runs per locale, which keeps mutable values from being shared.
 */
export function perSiteLocaleValue<T>(make: () => T): Record<SiteLocale, T> {
  return z
    .record(siteLocaleSchema, z.custom<T>())
    .parse(Object.fromEntries(SITE_LOCALES.map((locale) => [locale, make()])));
}

export function perTranslatedLocaleValue<T>(make: () => T): Record<TranslatedLocale, T> {
  return z
    .record(translatedLocaleSchema, z.custom<T>())
    .parse(Object.fromEntries(TRANSLATED_LOCALES.map((locale) => [locale, make()])));
}
