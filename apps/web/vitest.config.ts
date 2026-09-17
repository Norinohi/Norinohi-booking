import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    /* Unit tests only. `e2e/` belongs to Playwright, whose `test` would crash under vitest. */
    include: ["src/**/*.test.ts"],
    /*
     * Real-looking values rather than SKIP_ENV_VALIDATION, so a module that reads `env` at import
     * time (the static map URL builder) produces a stable string to assert against.
     */
    env: {
      NEXT_PUBLIC_SERVER_URL: "http://localhost:3000",
      NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test",
    },
  },
});
