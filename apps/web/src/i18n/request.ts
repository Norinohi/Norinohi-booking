import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

/*
 * i18n request config (next-intl, App Router, no i18n routing).
 * Locale comes from a `locale` cookie, defaulting to English — no URL prefix, so the
 * feature-module route groups stay untouched. A language switcher (e.g. behind the nav
 * Globe icon) sets the cookie; add locales by dropping a `messages/<locale>.json` file.
 */
export const locales = ["en", "uk"] as const;
export const defaultLocale = "en";
export type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get("locale")?.value;
  const locale = (locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
