import { loadStripe, type Stripe, type StripeElementLocale } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { env } from "@yacht-charter/env/web";

import type { Locale } from "@/i18n/config";

let loading: Promise<Stripe | null> | undefined;

/**
 * Null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is unset, which mirrors `stripeClient()`
 * on the server: the card tab then explains it is unavailable instead of mounting an
 * Elements provider that can never confirm anything.
 *
 * Memoised because loadStripe injects a script tag — calling it per render would add one
 * on every mount.
 */
export function stripeLoader(): Promise<Stripe | null> | null {
  const key = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  loading ??= loadStripe(key);
  return loading;
}

/**
 * Stripe ships no Ukrainian bundle, so `uk` falls through to "auto" and Elements
 * negotiates from the browser rather than rendering an unlabelled form.
 */
export function elementsLocale(locale: Locale): StripeElementLocale {
  switch (locale) {
    case "en":
      return "en";
    case "es":
      return "es";
    default:
      return "auto";
  }
}

/*
 * Elements renders in a cross-origin iframe, so it cannot read our CSS variables — the
 * values below are the resolved light-theme tokens from packages/ui/src/styles/globals.css.
 * The app is `forcedTheme="light"`, so one palette covers it; a dark theme would need a
 * second appearance keyed off the resolved theme.
 */
export const ELEMENTS_APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#2f80ed" /* --brand-500 */,
    colorBackground: "#ffffff" /* --card */,
    colorText: "#0a0a0a" /* --natural-900 */,
    colorTextSecondary: "#555555" /* --natural-500 */,
    colorDanger: "#ef4444" /* --error-500 */,
    borderRadius: "8px" /* --radius */,
    fontFamily: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "16px",
  },
  rules: {
    ".Input": { borderColor: "#e2e2e2" /* --border */, boxShadow: "none" },
    ".Input:focus": { borderColor: "#2f80ed", boxShadow: "none" },
    ".Label": { fontWeight: "700" },
  },
};
