import { expect, test } from "@playwright/test";

/*
 * Signed-out visitors never see an account or admin screen: `requireSignedIn` and `requireRole`
 * redirect before anything renders. No credentials are involved, so this runs anywhere.
 */

const GUARDED = [
  { area: "account", path: "/uk/profile" },
  { area: "admin", path: "/uk/users" },
];

for (const { area, path } of GUARDED) {
  test(`signed out: the ${area} route ${path} redirects to login`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/uk\/login(\?|$)/);
  });
}
