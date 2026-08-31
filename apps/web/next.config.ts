import "@yacht-charter/env/web";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { isPublicSite } from "./src/lib/site";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  /*
   * Prerendering enumerates ~3,900 catalog pages, and each one calls the API two or three times
   * (scoped facets, then results). At Next's defaults the export fleet sizes itself to the build
   * machine — 31 workers on Railway, 8 pages each — and puts several hundred concurrent requests
   * on a single server, so every render queues past the 60s page limit and the build dies having
   * generated 88% of the site. The failing URLs differ run to run, which is what identifies this
   * as contention rather than a broken route.
   *
   * Capping concurrency is the half that fixes it: fewer requests in flight means each page
   * answers in seconds instead of stacking, and wall-clock goes down rather than up. The raised
   * timeout is headroom for the slowest pages, not the remedy.
   *
   * Both are workarounds for the per-page API cost. The scoped `getFacets(scope)` read in
   * `prefetchSearch` is the one to profile before raising either number further.
   */
  staticPageGenerationTimeout: 180,
  experimental: {
    staticGenerationMaxConcurrency: 2,
    /*
     * Exposes the testing API that `@next/playwright`'s `instant()` drives. Without it `instant()`
     * silently no-ops and the navigation tests pass while proving nothing — a green suite that is
     * worse than no suite.
     *
     * Gated on an explicit opt-in so it is on for every measured build (`pnpm build:test`, CI) and
     * never in a production deploy. Do not widen this condition. See docs/adr/0003.
     */
    exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1",
  },
  /*
   * Origins `next dev` will serve its client runtime to. An origin missing here still gets the
   * server-rendered HTML, so the page looks like it loaded — then the HMR socket is refused,
   * nothing hydrates, and no query ever fires. It reads as "every request fails" when in fact
   * none was made.
   *
   * The private ranges are for testing on a phone over the LAN; the rest are tunnel hosts.
   */
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.trycloudflare.com",
  ],

  /*
   * A header rather than `Disallow: /`: `Disallow` blocks the fetch, so an already-indexed URL
   * could never be re-read and would never drop out. Same reasoning as `src/app/robots.ts`.
   */
  async headers() {
    if (isPublicSite(process.env.NEXT_PUBLIC_APP_URL)) return [];

    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
