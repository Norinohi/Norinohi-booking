import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

/*
 * Regression guard: home must commit its static shell immediately, on both navigation types.
 *
 * `instant()` gates request-time data, so a route that blocks on a data read cannot paint under
 * the lock and these fail. That is the point — they are what stops a future top-level `await`
 * above a boundary from quietly un-instanting the route. See instant-nav.rig.md.
 *
 * The marker is the hero `<h1>`: the LCP element, rendered synchronously, and deliberately kept
 * out of every Suspense boundary so it paints in the shell rather than waiting on a stream.
 */

const SHELL_MARKER = '[data-testid="home-shell-marker"]';
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

test("initial load: home serves its static shell", async ({ page }) => {
  await instant(
    page,
    async () => {
      await page.goto("/en");
      await expect(page.locator(SHELL_MARKER)).toBeVisible();
    },
    { baseURL: BASE_URL },
  );
});

test("soft navigation: home commits its prefetched shell", async ({ page }) => {
  await page.goto("/en/plan-my-trip");

  const wordmark = page.getByRole("link", { name: "YachtSkanner" });
  await expect(wordmark).toBeVisible();

  await instant(page, async () => {
    await wordmark.click();
    await expect(page.locator(SHELL_MARKER)).toBeVisible();
  });
});
