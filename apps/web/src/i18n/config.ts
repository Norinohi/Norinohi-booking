export const locales = ["en", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/* Endonyms — a language is always offered in its own language, so these stay out of `messages`. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

export const LOCALE_COOKIE = "locale";
