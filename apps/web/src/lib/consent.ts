import { z } from "zod";

/**
 * Cookie consent, shared by the server layout that boots Google Consent Mode and the
 * client banner that collects the choice. One module because both halves key off the
 * same storage entry, and a drifted key means the banner reappears for people who
 * already answered while the tag keeps whatever state it booted with.
 */

export type ConsentState = "granted" | "denied";

export const CONSENT_STORAGE_KEY = "yc_cookie_consent";

/**
 * Bump when a new vendor or purpose is added. A stored answer at a lower version was
 * given about a different set of cookies, so it stops counting and the banner asks
 * again. This is the whole reason the choice is an object rather than a bare string.
 */
export const CONSENT_VERSION = 1;

/** Consent is not permanent. Six months is the shorter end of common practice. */
const MAX_AGE_DAYS = 182;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/** Event the footer control fires to reopen the preferences dialog. */
const REOPEN_EVENT = "yc:cookie-preferences";

const storedConsentSchema = z.object({
  v: z.number(),
  analytics: z.boolean(),
  at: z.string(),
});

export type StoredConsent = z.infer<typeof storedConsentSchema>;

/**
 * Consent Mode carries seven signals. Naming every one is what makes the denied default
 * real: an unset signal reads as unknown, not as refused.
 *
 * Only `analytics_storage` is ours to vary. `functionality_storage` covers the wishlist
 * and the view counter, `security_storage` the auth session and Stripe's fraud checks —
 * both are what the site needs to work at all, so neither is offered as a choice. The
 * three ad signals and `personalization_storage` stay denied because there is no ad tech
 * and no personalisation here; granting them would be a claim we cannot back.
 */
export interface ConsentSignals {
  analytics_storage: ConsentState;
  functionality_storage: "granted";
  security_storage: "granted";
  ad_storage: "denied";
  ad_user_data: "denied";
  ad_personalization: "denied";
  personalization_storage: "denied";
}

export function consentPayload(analytics: boolean): ConsentSignals {
  return {
    analytics_storage: analytics ? "granted" : "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    personalization_storage: "denied",
  };
}

/**
 * `null` means "ask": nothing stored, a malformed blob, an answer about an older set of
 * cookies, or one that has aged out. Every one of those is a case where showing the
 * banner again is the correct outcome.
 */
export function readConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = storedConsentSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.v !== CONSENT_VERSION) return null;

    const age = Date.now() - Date.parse(parsed.data.at);
    if (!Number.isFinite(age) || age > MAX_AGE_MS) return null;

    return parsed.data;
  } catch {
    // Private mode and storage-blocking extensions throw. No stored answer means the
    // banner asks again, which is the safe direction to fail in.
    return null;
  }
}

export function writeConsent(analytics: boolean): void {
  try {
    const choice: StoredConsent = {
      v: CONSENT_VERSION,
      analytics,
      at: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // The choice still applies to this page view through the gtag update; it simply
    // will not survive a reload.
  }
}

/**
 * Every host a `_ga` cookie could have been written for: GA sets it on the registrable
 * domain, so `www.example.com` has to try `example.com` too, and a delete aimed at the
 * wrong domain silently does nothing.
 */
function cookieDomains(): Array<string | null> {
  const labels = location.hostname.split(".");
  const domains: Array<string | null> = [null];

  for (let index = 0; index <= labels.length - 2; index++) {
    const domain = labels.slice(index).join(".");
    domains.push(domain, `.${domain}`);
  }

  return domains;
}

/**
 * Withdrawing consent has to remove what was already stored, not just stop new writes.
 * `analytics_storage: denied` does the second only — Google's own documentation promises
 * no new cookies, never that existing ones go away — so a visitor who accepted and then
 * changed their mind would keep carrying `_ga` around. Nothing here reads those cookies;
 * expiring them is the only way they leave.
 */
export function clearAnalyticsCookies(): void {
  const names = document.cookie
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name) && name.startsWith("_ga"));

  for (const name of names) {
    for (const domain of cookieDomains()) {
      const scope = domain ? `;domain=${domain}` : "";
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${scope}`;
    }
  }
}

/** Fired by the footer control; the banner listens and reopens its dialog. */
export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

export function onCookiePreferencesRequested(handler: () => void): () => void {
  window.addEventListener(REOPEN_EVENT, handler);
  return () => window.removeEventListener(REOPEN_EVENT, handler);
}

/**
 * Runs before gtag.js, from the root layout. Two jobs that both have to happen in the
 * same tick: declare the denied default so the tag cannot write a cookie before anyone
 * has agreed, and re-apply a stored `granted` immediately so a returning visitor's first
 * page view is measured rather than lost while React hydrates.
 *
 * It repeats the version and age checks from `readConsent` rather than importing them:
 * this string runs as plain inline script with nothing bundled alongside it.
 */
export const CONSENT_BOOTSTRAP = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
window.gtag=window.gtag||gtag;
var a='denied';
try{
var r=JSON.parse(localStorage.getItem('${CONSENT_STORAGE_KEY}')||'null');
if(r&&r.v===${CONSENT_VERSION}&&r.analytics===true&&Date.now()-Date.parse(r.at)<${MAX_AGE_MS})a='granted';
}catch(e){}
gtag('consent','default',{analytics_storage:a,functionality_storage:'granted',security_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',personalization_storage:'denied'});
`.trim();
