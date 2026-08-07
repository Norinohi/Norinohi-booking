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

`localePrefix` is `"always"`: every locale is prefixed, including the default (`/en/yachts`). The
symmetry is worth one redirect hop — the middleware 307s unprefixed URLs to the negotiated locale,
so links minted before this change still resolve.

## Consequences

- All three locales get distinct URLs, so `hreflang` and per-locale canonicals are now emitted.
  Previously `buildMetadata` returned the same canonical for all three (`lib/seo.ts`).
- `next/link` and `next/navigation` are replaced by next-intl's `createNavigation` wrappers, so
  `href` strings stay locale-relative and unchanged at the call sites. `notFound` and `useParams`
  have no locale dimension and still come from `next/navigation`.
- **`typedRoutes` no longer types hrefs.** Generated `Route` values now include the `[locale]`
  segment, which is not the shape a locale-relative href has, so the 18 files that used `Route` now
  use `AppPathname` (`i18n/navigation.ts`) — currently an alias for `string`. Every one of those
  hrefs already carried an `as Route` cast, so little real checking was lost, but it is a genuine
  downgrade. Declaring `pathnames` on `defineRouting` would restore it.
- `proxy.ts` now serves two concerns: evlog on `/api/*`, locale negotiation everywhere else. `/api`
  must never be locale-rewritten or the auth and oRPC mounts would move.
- Server-side `redirect` calls need an explicit `locale` and must be written as
  `return redirect({...})` — TypeScript only narrows on never-returning functions that carry an
  explicit type annotation, which a destructured export does not.
- Prerendering surfaced latent `useSearchParams` violations: nuqs reads the query string on seven
  routes, each of which now needs a `<Suspense>` boundary. They currently use `fallback={null}`;
  real skeletons come with the instant-navigation work.
