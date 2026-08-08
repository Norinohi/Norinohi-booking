import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/*
 * Locale-aware replacements for `next/link` and `next/navigation`. Import these instead of the
 * Next primitives anywhere a *page* is being linked to or navigated to: they carry the active
 * locale automatically, so `href` values stay locale-relative ("/yachts") and never hardcode a
 * prefix. `notFound` has no locale dimension and still comes from `next/navigation`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

/*
 * A locale-relative path, as accepted by the wrapped `Link` and router — "/yachts/lagoon-42",
 * never "/en/yachts/lagoon-42".
 *
 * This replaces Next's `Route` type at these call sites. `typedRoutes` now generates routes that
 * include the `[locale]` segment, so `Route` and a locale-relative href are no longer the same
 * shape. The practical loss is small: most hrefs here are template strings that `Route` could
 * never verify anyway, which is why every one of them carried an `as Route` cast. To recover
 * real checking, declare `pathnames` on `defineRouting` and use next-intl's generated types.
 */
export type AppPathname = string;
