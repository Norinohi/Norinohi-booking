import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { defaultLocale, LOCALE_COOKIE, locales } from "./config";
import { formats } from "./formats";

/*
 * Locale comes from a cookie rather than a URL prefix, so the feature-module route groups
 * stay untouched and no middleware is needed. Add a locale by extending `locales` in
 * ./config and dropping a matching `messages/<locale>.json`.
 */
export default getRequestConfig(async () => {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = hasLocale(locales, requested) ? requested : defaultLocale;

  return {
    locale,
    formats,
    /*
     * Pinned so output never depends on where the server runs. Every real instant carries its own
     * zone (a charter time is the marina's wall clock, not the visitor's), and calendar days are
     * UTC-anchored via `dayToDisplay` — so this is only the fallback, and it must not drift.
     */
    timeZone: "UTC",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
