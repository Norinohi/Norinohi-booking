import { expect, test } from "@playwright/test";

/*
 * Tagged @live-map and skipped in CI (see `grepInvert` in playwright.config.ts): markers only mount
 * once Mapbox has loaded a style, which needs a real `pk.` token, and CI deliberately carries a
 * placeholder. Run it locally against a dev server with a working token.
 */

test(
  "the map at a shared camera shows marinas and a pressed one opens its card",
  { tag: "@live-map" },
  async ({ page, isMobile }) => {
    await page.goto("/uk/yachts/map?zoom=9&centre=16.44,43.5");

    const markers = page.locator(".mapboxgl-marker button");
    await expect(markers.first()).toBeVisible({ timeout: 30_000 });

    /* A bare pin is a marina with one boat; a pill with a count may be a cluster that only zooms. */
    const pin = page.locator(".mapboxgl-marker button:not(:has(span))").first();
    /* On a phone the dev server's indicator sits over the lower map and swallows the pointer, so
       the pin is pressed the way a keyboard user would; the marker handles Enter the same way. */
    if (isMobile) {
      await pin.focus();
      await page.keyboard.press("Enter");
    } else {
      await pin.click();
    }

    const popup = page.locator(".mapboxgl-popup");
    await expect(popup.locator("article").first()).toBeVisible();
  },
);
