import { evlogMiddleware } from "evlog/next";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

/*
 * Three concerns share one proxy because Next allows only one.
 *
 * `/api/*` is logged and otherwise passed through untouched — it must never be locale-rewritten,
 * or the auth and oRPC paths would move. Everything else goes through next-intl's negotiation,
 * which redirects an unprefixed path to the visitor's locale (`/yachts` → `/en/yachts`) and
 * leaves already-prefixed paths alone.
 *
 * On the way past, a page request also picks up the visitor's country as a plain cookie. That
 * is the only place it can happen: the pages are cached for everyone and a cached function may
 * not read a header (docs/adr/0002), so the header is read here, once, and left where client
 * JavaScript can pick it up after mount. Not httpOnly, because being readable by the browser is
 * the entire point, and it carries nothing but a two-letter country code.
 */
const logApiRequest = evlogMiddleware();
const negotiateLocale = createMiddleware(routing);

/*
 * Where each platform puts the visitor's country. Best-effort by design: a deployment behind
 * none of these simply has no country, and the currency layer falls back to its configured
 * default rather than guessing from the locale -- a Ukrainian speaker in Berlin pays in euro.
 */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code"];

const COUNTRY_COOKIE = "cn_country";
const COUNTRY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api")) {
    return logApiRequest(request);
  }

  const response = negotiateLocale(request);

  const country = countryOf(request);
  if (country && request.cookies.get(COUNTRY_COOKIE)?.value !== country) {
    response.cookies.set(COUNTRY_COOKIE, country, {
      maxAge: COUNTRY_COOKIE_MAX_AGE,
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

function countryOf(request: NextRequest): string | null {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header)?.trim().toUpperCase();
    /* Cloudflare answers XX for anonymised clients and T1 for Tor, neither of which is a place. */
    if (value && /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1") return value;
  }
  return null;
}

export const config = {
  // `/api/:path*` for logging; the negative lookahead covers page routes while skipping Next
  // internals and any path with a file extension (static assets, favicon, images).
  //
  // `apple-icon` is named explicitly because it is the one generated metadata route with no file
  // extension — `robots.txt`, `sitemap.xml` and `favicon.ico` all carry a dot and are already
  // covered. Without it, `/apple-icon` gets locale-redirected to `/en/apple-icon`, which does not
  // exist (the file sits above `[locale]`), so the icon 404s. Any future dotless metadata route
  // — `icon`, `opengraph-image` — has to be added here too.
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|apple-icon|.*\\..*).*)"],
};
