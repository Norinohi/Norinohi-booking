import "@yacht-charter/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  typescript: {
    // TypeScript 7 moved the compiler API out of the package's main export
    // (`.` is now a version stub), so Next.js cannot load it to type-check.
    // Type checking is NOT skipped: turbo.json makes `build` depend on
    // `check-types`, which runs `tsc --noEmit` against this app.
    //
    // REMOVE THIS once Next.js 16.3 is stable, and replace with:
    //   experimental: { useTypeScriptCli: true }
    // which runs the local tsc binary instead of the JS API.
    // See https://github.com/vercel/next.js/pull/95639
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
