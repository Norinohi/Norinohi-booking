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
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
