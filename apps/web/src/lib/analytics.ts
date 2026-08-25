"use client";

import { env } from "@yacht-charter/env/web";

/**
 * Browser-side product analytics. Server-side events already reach PostHog through
 * the evlog drain in `./evlog`; this covers what never touches our server, which is
 * most of a search-and-browse funnel: filter changes, gallery opens, an abandoned
 * checkout step.
 *
 * Deliberately a hand-rolled `fetch` against PostHog's capture endpoint rather than
 * posthog-js. The whole surface we need is one POST, and the SDK is ~50 kB on a page
 * whose job is to render fast. Swap it for the SDK the day we want session replay or
 * feature flags, and keep this signature.
 *
 * With no key configured every call is a no-op, so call sites need no guard of their
 * own and stay in place for when the credentials land.
 */

const KEY = env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * PostHog keys events by person, not by session. Without a stable id every event
 * is its own one-off user and no funnel can be built, so this generates one and
 * keeps it in localStorage. Anonymous by construction: no identifier of ours is
 * mixed in, which is also what keeps this out of consent-gated territory.
 */
const DISTINCT_ID_KEY = "yc_analytics_id";

function distinctId(): string | null {
  try {
    const existing = localStorage.getItem(DISTINCT_ID_KEY);
    if (existing) return existing;

    const fresh = crypto.randomUUID();
    localStorage.setItem(DISTINCT_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode and storage-blocking extensions both throw here. Analytics is
    // never worth breaking a page over, so the event is simply dropped.
    return null;
  }
}

/**
 * What a property may hold. Narrower than what PostHog accepts, on purpose: a
 * nested object arrives in the dashboard as an unqueryable blob, and the point of
 * an event property is to be grouped and filtered by.
 */
export type AnalyticsValue = string | number | boolean | null;

export function track(event: string, properties: Record<string, AnalyticsValue> = {}): void {
  if (!KEY) return;

  /*
   * Also the server-render guard. This runs during the SSR pass of any client
   * component that calls it at render time, where `localStorage` throws and the
   * catch below returns null, so nothing further touches a browser global.
   */
  const id = distinctId();
  if (!id) return;

  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: id,
    properties: {
      ...properties,
      $current_url: window.location.href,
    },
    timestamp: new Date().toISOString(),
  });

  /*
   * sendBeacon survives the page unload that follows most interesting events (a
   * click that navigates away), which a plain fetch does not. `keepalive` is the
   * fallback for the same reason.
   */
  const url = `${env.NEXT_PUBLIC_POSTHOG_HOST}/i/v0/e/`;
  if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Ad blockers reject this request as a matter of course; it is not an error.
  });
}
