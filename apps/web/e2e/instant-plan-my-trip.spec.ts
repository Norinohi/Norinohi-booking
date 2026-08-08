import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

/*
 * Regression guard: the trip planner's frame must commit immediately on both navigation types.
 *
 * What is guarded is the wizard's frame, not its steps. The steps are a function of the query
 * string (nuqs), so they are per-request by nature; the card, its close control and the page
 * padding have no URL dependency and prerender. The frame is also the boundary's fallback, so the
 * card never resizes when the steps arrive.
 *
 * See instant-nav.rig.md.
 */

const SHELL_MARKER = '[data-testid="plan-my-trip-shell-marker"]';
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

test("initial load: /plan-my-trip serves its static shell", async ({ page }) => {
  await instant(
    page,
    async () => {
      await page.goto("/en/plan-my-trip");
      await expect(page.locator(SHELL_MARKER)).toBeVisible();
    },
    { baseURL: BASE_URL },
  );
});

test("soft navigation: /plan-my-trip commits its prefetched shell", async ({ page }) => {
  await page.goto("/en");

  const toPlanner = page.locator('a[href="/en/plan-my-trip"]:visible').first();
  await expect(toPlanner).toBeVisible();

  await instant(page, async () => {
    await toPlanner.click();
    await expect(page.locator(SHELL_MARKER)).toBeVisible();
  });
});
