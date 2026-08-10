import "server-only";

import { hasLocale } from "next-intl";
import { locale as localeRootParam } from "next/root-params";

import { routing } from "./routing";

/**
 * The active locale, readable from inside a `"use cache"` function.
 *
 * `getLocale()` cannot be used there — it is a request-scoped read, and those are illegal inside a
 * cache scope. `next/root-params` is the sanctioned way in: `[locale]` is the root dynamic segment
 * (docs/adr/0001), so Next already knows its value per prerendered variant and makes it part of the
 * cache key. That is what lets the catalog helpers take the locale without every page threading it
 * down as an argument.
 *
 * The narrowing is not decoration. The generated root-param type is `Promise<string>`, while the
 * client half reads `useLocale()` and gets the union — and both sides have to produce the *same*
 * value for a query key seeded on the server to be the one the browser reads back. Funnelling both
 * through `routing.locales` is what keeps that true. An unknown prefix never reaches a page anyway:
 * the middleware redirects it and the root layout calls `notFound()`.
 */
export async function getRootLocale() {
  const value = await localeRootParam();

  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
