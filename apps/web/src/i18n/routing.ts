import { defineRouting } from "next-intl/routing";

import { defaultLocale, locales } from "./config";

/*
 * Locale lives in the URL (`/en/yachts/123`), not a cookie — see docs/adr/0001. A prerendered
 * shell is a single artifact and cannot vary by cookie without going dynamic, so the segment is
 * what makes `generateStaticParams` able to enumerate all three locales at build time.
 *
 * `localePrefix: "always"` keeps every locale symmetric; the middleware redirects unprefixed
 * paths to the negotiated locale, so links minted before this change still resolve.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
