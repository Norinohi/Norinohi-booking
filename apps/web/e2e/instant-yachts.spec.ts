import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

/*
 * Regression guard: the /yachts search frame must commit immediately on both navigation types.
 *
 * What is guarded is the frame, not the results. The result set is a function of the URL
 * (filters, sort, page) and is fetched per request behind its own boundary — there is no shell
 * that would be correct for every filter combination. The marker is the static "search by map"
 * card in the aside, which has no URL or query dependency and so prerenders.
 *
 * See instant-nav.rig.md.
 */

const SHELL_MARKER = '[data-testid="yachts-shell-marker"]';
const SEARCH_LINK = 'a[href="/en/yachts"]';
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

test("initial load: /yachts serves its static shell", async ({ page }) => {
  await instant(
    page,
    async () => {
      await page.goto("/en/yachts");
      await expect(page.locator(SHELL_MARKER)).toBeVisible();
    },
    { baseURL: BASE_URL },
  );
});

test("soft navigation: /yachts commits its prefetched shell", async ({ page }) => {
  await page.goto("/en");

  /*
   * The hero's own link. Home carries 14 links to this route; the nav bar's copy is hidden below
   * 1360px, so scope to the hero rather than taking whichever comes first in the DOM.
   *
   * Found by what a section contains rather than by being first: the cookie banner is a `<section>`
   * too, and it renders ahead of the page content on purpose so its buttons are not 40 tab stops
   * in. It only appears where `NEXT_PUBLIC_GA_ID` is set — which CI does not and a developer's
   * `.env.local` does — so taking the first section passed here and failed on a real machine.
   */
  const hero = page
    .locator("section")
    .filter({ has: page.locator(SEARCH_LINK) })
    .first();
  const toSearch = hero.locator(SEARCH_LINK).first();
  await expect(toSearch).toBeVisible();

  await instant(page, async () => {
    await toSearch.click();
    await expect(page.locator(SHELL_MARKER)).toBeVisible();
  });
});
