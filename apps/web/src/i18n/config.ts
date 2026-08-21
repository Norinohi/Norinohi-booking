export const locales = ["en", "es", "uk"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Shown in the language switcher. Always English, whichever locale is active — see that component. */
export const localeNames = {
  en: "English",
  es: "Spanish",
  uk: "Ukrainian",
} satisfies Record<Locale, string>;
