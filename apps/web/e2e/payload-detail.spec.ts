import { expect, test } from "@playwright/test";

/*
 * Regression guard: the listing page must not pull the map engine on load.
 *
 * Mapbox is ~1.8MB. `next/dynamic` does not prevent this on its own — it skips server rendering,
 * but the chunk still downloads and initialises when the component mounts, and this page mounts
 * every section at once. Initialising it ran forced reflows that tied up the main thread, which
 * made navigating *away* from a listing take 767ms to home and 1493ms to search. Gating the map on
 * viewport entry brought both to ~180ms.
 *
 * Asserted by payload rather than by timing: a stopwatch here would be flaky, whereas "no
 * megabyte-scale script before the map is scrolled to" is deterministic and fails loudly if
 * someone reverts the gate to a bare import.
 */

const SLUG = "liburna-sunseeker-predator-50-athens";
const HEAVY_CHUNK_BYTES = 900_000;

test("no megabyte-scale script loads before the map is scrolled to", async ({ page }) => {
  const heavy: string[] = [];

  page.on("response", (response) => {
    if (
      response.url().includes("/_next/static/chunks/") &&
      response.request().resourceType() === "script"
    ) {
      const size = Number(response.headers()["content-length"] ?? 0);
      if (size > HEAVY_CHUNK_BYTES) {
        heavy.push(`${Math.round(size / 1024)}KB ${response.url().split("/").pop()}`);
      }
    }
  });

  await page.goto(`/en/yachts/${SLUG}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  expect(heavy, `unexpected heavy chunks on load: ${heavy.join(", ")}`).toEqual([]);
});
