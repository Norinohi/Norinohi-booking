import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { formats } from "./formats";
import { routing } from "./routing";

/*
 * Locale comes from the `[locale]` URL segment (docs/adr/0001). `requestLocale` reads that
 * segment rather than a cookie, which is what lets a route prerender: a cookie read here would
 * make every layout above it dynamic. Add a locale by extending `locales` in ./config and
 * dropping a matching `messages/<locale>.json`.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

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
