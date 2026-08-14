import { loadStripe, type Stripe, type StripeElementLocale } from "@stripe/stripe-js";
import type { StripePaymentElementOptions } from "@stripe/stripe-js";
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
 * Manrope has to be fetched by the iframe itself. `next/font` loads it into our
 * document and exposes it as `--font-manrope`, but a CSS variable does not cross an
 * origin boundary: naming one in `fontFamily` makes the whole declaration invalid
 * inside Elements, and everything falls back to the browser's default serif.
 */
export const ELEMENTS_FONTS = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap" },
];

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
    // The literal family, not the variable: see ELEMENTS_FONTS above.
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "16px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      borderColor: "#e2e2e2" /* --border */,
      boxShadow: "none",
      padding: "12px",
    },
    ".Input:focus": { borderColor: "#2f80ed", boxShadow: "none" },
    ".Input::placeholder": { color: "#8f8f8f" },
    ".Label": { fontWeight: "700", fontSize: "14px", marginBottom: "6px" },
    /*
     * Matching the app's own cards: one hairline border, no drop shadow. Stripe's
     * default gives each accordion row a shadow, which reads as a raised tile next to
     * our flat panels.
     */
    ".AccordionItem": {
      borderColor: "#e2e2e2",
      boxShadow: "none",
      paddingTop: "14px",
      paddingBottom: "14px",
    },
    ".AccordionItem:hover": { borderColor: "#bfbfbf" /* --natural-200 */ },
    ".AccordionItem--selected": { borderColor: "#2f80ed", boxShadow: "none" },
  },
};

/*
 * Accordion rather than tabs: the tab strip truncates once more than a few methods are
 * eligible, and the set is a Dashboard decision that can grow without warning.
 * `radios: "never"` drops the selection circles — the expanded item is already the
 * selection — and the spacing carries the grouping instead of a border.
 *
 * Shared so the deposit form and the balance form cannot drift apart visually.
 */
export const PAYMENT_ELEMENT_LAYOUT: NonNullable<StripePaymentElementOptions["layout"]> = {
  type: "accordion",
  defaultCollapsed: false,
  radios: "never",
  spacedAccordionItems: true,
};
