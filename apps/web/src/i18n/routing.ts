import { defineRouting } from "next-intl/routing";

import { defaultLocale, locales } from "./config";

/*
 * Locale lives in the URL (`/en/yachts/123`), not a cookie — see docs/adr/0001. A prerendered
 * shell is a single artifact and cannot vary by cookie without going dynamic, so the segment is
 * what makes `generateStaticParams` able to enumerate every locale at build time.
 *
 * `localePrefix: "always"` keeps every locale symmetric; the middleware redirects unprefixed
 * paths to the negotiated locale, so links minted before this change still resolve.
 *
 * `NEXT_LOCALE` only decides where an unprefixed entry lands -- a bare `/`, or a link somebody
 * pasted without a locale. next-intl writes it with no expiry, which makes it a session cookie:
 * a visitor who picked Ukrainian was back on their browser's language the next morning. A year
 * is what the choice is worth, and it holds nothing but a two-letter code.
 *
 * Only the language switcher writes it (next-intl's router sets it client-side on a locale
 * change). The proxy drops the copy the middleware would write on every prefixed page load, so
 * following an `/en/...` link from an ad does not overwrite a visitor's saved choice.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE, maxAge: 60 * 60 * 24 * 365 },
});
