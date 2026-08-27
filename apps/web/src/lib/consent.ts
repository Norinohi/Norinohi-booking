/**
 * Cookie consent, shared by the server layout that boots Google Consent Mode and the
 * client banner that collects the choice. One module because both halves key off the
 * same storage entry, and a drifted key means the banner reappears for people who
 * already answered while the tag keeps whatever state it booted with.
 */

export type ConsentState = "granted" | "denied";

export const CONSENT_STORAGE_KEY = "yc_cookie_consent";

/**
 * Consent Mode v2 expects all four signals even though we only ever measure analytics:
 * an unset signal is treated as unknown rather than denied, so naming them explicitly is
 * what makes the denied default real. The three ad signals stay denied unconditionally —
 * there is no ad tech on this site, and granting them would be a claim we cannot back.
 */
export interface ConsentSignals {
  analytics_storage: ConsentState;
  ad_storage: "denied";
  ad_user_data: "denied";
  ad_personalization: "denied";
}

export function consentPayload(state: ConsentState): ConsentSignals {
  return {
    analytics_storage: state,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

export function readConsent(): ConsentState | null {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    // Private mode and storage-blocking extensions throw. No stored answer means the
    // banner asks again, which is the safe direction to fail in.
    return null;
  }
}

export function writeConsent(state: ConsentState): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    // The choice still applies to this page view through the gtag update below; it
    // simply will not survive a reload.
  }
}

/**
 * Runs before gtag.js, from the root layout. Two jobs that both have to happen in the
 * same tick: declare the denied default so the tag cannot write a cookie before anyone
 * has agreed, and re-apply a stored `granted` immediately so a returning visitor's first
 * page view is measured rather than lost while React hydrates.
 */
export const CONSENT_BOOTSTRAP = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
window.gtag=window.gtag||gtag;
var s='denied';
try{if(localStorage.getItem('${CONSENT_STORAGE_KEY}')==='granted')s='granted'}catch(e){}
gtag('consent','default',{analytics_storage:s,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
`.trim();
