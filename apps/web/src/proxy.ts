import { evlogMiddleware } from "evlog/next";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

/*
 * Two concerns share one proxy because Next allows only one.
 *
 * `/api/*` is logged and otherwise passed through untouched — it must never be locale-rewritten,
 * or the auth and oRPC paths would move. Everything else goes through next-intl's negotiation,
 * which redirects an unprefixed path to the visitor's locale (`/yachts` → `/en/yachts`) and
 * leaves already-prefixed paths alone.
 */
const logApiRequest = evlogMiddleware();
const negotiateLocale = createMiddleware(routing);

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api")) {
    return logApiRequest(request);
  }

  return negotiateLocale(request);
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
