import { type DisplayCurrency, isDisplayCurrency } from "@yacht-charter/api/lib/display-currency";

/*
 * The browser half of the display currency: what this device remembers and what the platform
 * told the middleware about it. The decisions themselves are pure and live in `packages/api`,
 * where they can be tested.
 */

const STORAGE_KEY = "charternavi.currency";

/** The visitor's own pick, or null where nothing was stored or the value is no longer offered. */
export function readStoredCurrency(): DisplayCurrency | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isDisplayCurrency(raw) ? raw : null;
  } catch {
    /* Private mode and storage-blocking extensions throw. Detection then decides every visit,
       which is the same answer somebody who never chose would get. */
    return null;
  }
}

export function writeStoredCurrency(currency: DisplayCurrency): void {
  try {
    localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    /* The choice still applies to this page view; it simply will not survive a reload. */
  }
}

/** The cookie the middleware writes from the platform's geo header. Read by client JS only. */
export const COUNTRY_COOKIE = "cn_country";

export function readCountryCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([A-Za-z]{2})(?:;|$)`));
  return match?.[1]?.toUpperCase() ?? null;
}
