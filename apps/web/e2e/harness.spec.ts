import { expect, test } from "@playwright/test";

/*
 * Harness smoke test — proves the rig itself works before any navigation guard relies on it:
 * Playwright reaches the app, the production build serves, and locale routing behaves.
 *
 * It deliberately does NOT assert anything about instant navigation. `instant()` no-ops when the
 * testing API is absent, so a green `instant()` here would prove nothing on its own. The real
 * proof that the lock engages is the first failing navigation guard (a route that blocks must fail
 * under the lock before it is fixed) — that arrives with the per-route work.
 */

test.describe("rig", () => {
  test("serves a prerendered route", async ({ page }) => {
    const response = await page.goto("/en/plan-my-trip");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("redirects an unprefixed path to a locale", async ({ page }) => {
    await page.goto("/plan-my-trip");

    await expect(page).toHaveURL(/\/en\/plan-my-trip$/);
  });

  test("serves the same route in another locale", async ({ page }) => {
    const response = await page.goto("/uk/plan-my-trip");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  });
});
