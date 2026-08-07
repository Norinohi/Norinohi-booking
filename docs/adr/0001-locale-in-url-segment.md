---
status: accepted
---

# Locale lives in the URL segment, not a cookie

Locale was resolved from a `locale` cookie inside `getRequestConfig`, which meant the root layout
had to `await getLocale()` — a `cookies()` read that opted every route in the app out of static
rendering. We are moving the locale into a `[locale]` URL segment with `generateStaticParams` over
`en | es | uk`, because a prerendered static shell is a single artifact and cannot vary by cookie
without becoming dynamic; with 89 client components calling `useTranslations`, the locale cannot be
deferred below a Suspense boundary either without emptying the shell.

## Considered options

- **Keep the cookie, prerender an English-only shell.** Rejected: `es`/`uk` users get a flash of
  English on every navigation, and the translated subtree — nearly the whole app — has to stream.
- **Keep the cookie, give up on a static shell.** Rejected: this is the status quo, and it makes the
  instant-navigation goal unreachable by construction.
- **Domain-based locale (`en.` / `es.` / `uk.`).** Rejected: three domains plus DNS to operate, and
  it complicates the cross-subdomain auth cookie setup that already required a `COOKIE_DOMAIN` fix.

## Consequences

- All three locales get distinct URLs, so `hreflang` and per-locale canonicals become expressible.
  Today `buildMetadata` emits the same canonical for all three (`lib/seo.ts`).
- `next/link` and `next/navigation` imports are replaced by next-intl's `createNavigation` wrappers
  so `href` strings stay locale-relative and unchanged at the 42 call sites.
- `typedRoutes: true` route types shift to include the locale segment; the 15 `as Route` casts need
  review.
- A middleware is introduced for locale negotiation and redirect of unprefixed URLs. The existing
  `proxy.ts` is an evlog middleware matched only on `/api/:path*` and is unaffected.
