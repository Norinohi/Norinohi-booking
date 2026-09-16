import { expect, test } from "@playwright/test";

import yachtDetail from "../messages/uk/YachtDetail.json";

/*
 * Reached through the first search card rather than a fixed slug, so it holds for the CI seed and
 * for a local provider sync alike.
 */

test("the yacht detail page shows the booking sidebar", async ({ page, isMobile }) => {
  await page.goto("/uk/yachts");

  const link = page.locator('article h3 a[href^="/uk/yachts/"]').first();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  /* A hard load, not a click: this asserts the page, and a click before hydration is a no-op. */
  await page.goto(href ?? "");

  /* Below `xl` the sidebar is the second tab rather than a column beside the details. */
  if (isMobile) {
    await page.getByRole("tab", { name: yachtDetail.panels.booking }).click();
  }

  const sidebar = page.getByRole("complementary").filter({
    has: page.getByRole("button", { name: yachtDetail.sidebar.requestQuote }),
  });
  await expect(sidebar.first()).toBeVisible();
});
