import "@yacht-charter/env/web";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { isPublicSite } from "./src/lib/site";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  reactCompiler: true,
  experimental: {
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
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.trycloudflare.com"],

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
