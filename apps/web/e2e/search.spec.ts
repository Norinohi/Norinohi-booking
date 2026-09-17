import { expect, test } from "@playwright/test";

import common from "../messages/uk/Common.json";

/*
 * The catalogue renders cards from whatever the database holds, so these assert that some exist
 * rather than which. The CI seed and a real provider sync both satisfy that.
 */

const durationChip = (days: string) =>
  common.removeFilter.replace("{label}", `Тривалість: ${days}`);

test("search renders yacht cards linking to their detail pages", async ({ page }) => {
  await page.goto("/uk/yachts");

  const card = page.locator("article").filter({ has: page.locator('h3 a[href^="/uk/yachts/"]') });
  await expect(card.first()).toBeVisible();
});

test("a duration filter in the URL survives a reload", async ({ page }) => {
  await page.goto("/uk/yachts?duration=10");

  const chip = page.getByRole("button", { name: durationChip("10 днів"), exact: true });
  await expect(chip).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/[?&]duration=10(&|$)/);
  await expect(chip).toBeVisible();
});
