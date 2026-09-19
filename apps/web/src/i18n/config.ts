import { DEFAULT_LOCALE, SITE_LOCALES, type SiteLocale } from "@yacht-charter/api/lib/locales";

/* The list itself lives in `@yacht-charter/db/locales`, shared with the API and the seeds. */
export const locales = SITE_LOCALES;

export type Locale = SiteLocale;

export const defaultLocale: Locale = DEFAULT_LOCALE;

/*
 * The locales whose catalog pages the build prerenders in full. The rest get one page per root
 * (Cache Components refuses an empty `generateStaticParams`) and render every other page on its
 * first request, so a new language does not multiply the build against the live API.
 */
export const prerenderedCatalogLocales: readonly Locale[] = ["en", "es", "uk", "de"];

/** Shown in the language switcher. Always English, whichever locale is active — see that component. */
export const localeNames = {
  en: "English",
  es: "Spanish",
  uk: "Ukrainian",
  de: "German",
  fr: "French",
  pl: "Polish",
  it: "Italian",
  nl: "Dutch",
} satisfies Record<Locale, string>;
