import { env } from "@yacht-charter/env/web";
import type { MetadataRoute } from "next";

/*
 * Lives at `src/app/robots.ts`, outside `[locale]`, so it serves `/robots.txt` unprefixed.
 * The proxy matcher in `src/proxy.ts` skips any path containing a dot, so next-intl never
 * redirects this to `/en/robots.txt`.
 *
 * Private routes are deliberately *not* disallowed here. They already carry `noindex` through
 * `buildMetadata({ noIndex: true })`, and a crawler has to fetch a page to see that header — a
 * `Disallow` would block the fetch and leave an already-indexed URL stuck in the index with no
 * way to drop out. Disallow is for paths with no meta-robots of their own.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_APP_URL).toString(),
  };
}
