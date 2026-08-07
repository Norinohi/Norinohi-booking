import { defineConfig, devices } from "@playwright/test";

/*
 * The navigation guards must run against a production build — `next dev` does not prefetch, so an
 * `instant()` verdict taken there is meaningless. `webServer` therefore runs `next start`, never
 * `next dev`, and the build it serves must come from `pnpm build:test` (which sets
 * EXPOSE_TESTING_API=1). See instant-nav.rig.md.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  /*
   * Two viewports because a static shell that only matches the real render at one breakpoint is a
   * skeleton mismatch, not an instant route (optimizer skill, D2).
   */
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "pnpm start",
    url: BASE_URL,
    // Reuse a server you started by hand locally; in CI always start a fresh one so the artifact
    // under test is unambiguously the one just built.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
