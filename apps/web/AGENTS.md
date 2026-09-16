# AGENTS.md

These instructions apply to `apps/web` and layer on top of the repository root `AGENTS.md`.

## Scope

The Next.js 16 App Router frontend (package name `web`), served on port 3001 with Turbopack. It renders UI, calls the server over oRPC, and owns no data access of its own.

## Commands

```bash
pnpm dev:web                 # from repo root
pnpm --filter web build      # next build
pnpm --filter web check-types  # tsc --noEmit
pnpm --filter web test         # vitest, unit tests only
pnpm --filter web test:e2e     # playwright, against a production build (see playwright.config.ts)
```

## Tests

- **Unit (Vitest)**: `src/**/*.test.ts`, colocated with the module, node environment, `@/` alias from `vitest.config.ts`. Pure logic only: parsers, mappers, geometry, role checks. Root `pnpm test` runs them through turbo. The config supplies `NEXT_PUBLIC_SERVER_URL` and a `pk.test` Mapbox token, so modules that read `env` at import time load without `SKIP_ENV_VALIDATION`.
- **Importing a barrel pulls its components.** `@/components/shared/form/filters` re-exports React components that drag `next/navigation` into node and fail to resolve, so a unit under test imports the `lib/` file it needs directly. Translators are real: `createTranslator({ locale: "en", messages, namespace })` over `messages/en`, not a hand-rolled stub.
- **E2E (Playwright)**: `e2e/*.spec.ts`, desktop and mobile projects. Specs must hold on the CI seed and on a local provider sync alike, so they reach data through the UI (the first search card) rather than a seed slug where they can, and they never sign in. A spec that needs something CI does not have carries a tag and is dropped by `grepInvert` under `CI`: `@live-map` needs a real Mapbox token, which CI deliberately does not carry.

## Conventions

- `tsconfig.json` here does **not** extend `@yacht-charter/config/tsconfig.base.json` — it is Next's own config with the `next` plugin and `paths` for `@/*` and `@yacht-charter/ui/*`. Do not "fix" it to extend the base; the two disagree on `target`, `lib`, and `types` on purpose.
- Component placement (see **Architecture** below): framework-agnostic primitives → `packages/ui`; cross-feature but Next/app-coupled → `src/components/shared`; app chrome → `src/components/layout`; feature-specific → `src/features/<name>/components`. The `packages/ui`-vs-`shared` test: _"could it live in `packages/ui` without pulling in `next`?"_ — yes → `packages/ui`, no → `src/components/shared`.
- `src/components/shared` uses the **same category names as `packages/ui`** (`actions`, `data-display`, `feedback`, `form`, `layout`, `navigation`, `overlay`), so a component's category does not change when it is promoted between the two. Import with the full path: `@/components/shared/data-display/yacht-card/yacht-card`. There is no barrel export.
- Never edit `next-env.d.ts` — Next regenerates it and the file says so.
- **An exported component's props go in an `interface`, never a `type` alias to an object literal and never an inline literal on the parameter.** Next's TS plugin warns `ts(71007)` on any exported component in a `"use client"` file whose props type is a _type literal_ carrying a function-typed member — it reads every `onChange`/`onOpenChange`/`set` as a Server Action that was named wrong. Every one of those is a false positive here: these are client-to-client callbacks that never cross an RSC boundary, and renaming them `onChangeAction` would assert something untrue. The rule tests for a type literal specifically (`rules/client-boundary.js` in `next/dist/server/typescript`), and an interface declaration is not one, so declaring the props as an interface silences it honestly. Generic components carry the parameter across: `interface QuizCardGridProps<T extends string>`.
- Server data goes through `src/utils/orpc.ts` (`client`, `orpc`, `queryClient`). Do not construct an `RPCLink` or a second `QueryClient` elsewhere; `src/components/layout/providers.tsx` already mounts the singleton (and the `NuqsAdapter`).
- Auth goes through `src/lib/auth-client.ts` (`authClient`). Preserve the `baseURL` comment there — the `/api/auth` path must match the server mount.
- Roles go through `src/lib/auth/`. `roles.ts` (client-safe) re-exports the API's `Role` type, holds `STAFF_ROLES` and `hasRole(user, ...roles)`; `server.ts` (server-only) holds the cached `getSessionUser`, `requireSignedIn` (signed out: `/login`) and `requireRole(...roles)` (signed out: `/login`, wrong role: `/profile`). `Role` is a type-only import: the enum values live in `packages/db` and must not reach the browser bundle. Never compare `role` strings inline. Menu visibility per role is declared once in `NAV_SECTIONS` (`src/components/layout/account-nav.ts`); a new role-specific area is a section with a `roles` field, not a conditional in the sidebar or user menu.
- `reactCompiler: true` and `typedRoutes: true` are enabled in `next.config.ts`. Route types and the
  `*.png` module declarations come from generated files (`.next/types/*`, `next-env.d.ts`) that are
  **gitignored**, so a bare `tsc --noEmit` fails on a fresh clone with `TS2307: Cannot find module
'…​.png'`. `check-types` therefore runs `next typegen && tsc --noEmit`. On a machine that has built
  before it looks like `tsc` alone suffices — it does not, and CI proved it.
- `next.config.ts` imports `@yacht-charter/env/web` purely for its validation side effect — keep that import first.
- Logging is split across `src/lib/evlog.ts`, `instrumentation.ts`, and `src/proxy.ts`. Edit `src/lib/evlog.ts`; the other two delegate to it.

## Translations

- **One file per top-level namespace**: `messages/<locale>/<Namespace>.json`, for `en`, `de`, `es`, `uk`. Each locale's `messages/<locale>/index.ts` imports its files and default-exports the merged object, so `useTranslations("Booking.review")` resolves exactly as it did against one big file. `src/i18n/messages.ts` holds one loader per locale (checked with `satisfies` against the `en` shape) and `src/i18n/request.ts` calls it. The next-intl `Messages` type in `global.d.ts` comes from `messages/en`.
- **A new namespace** is a `<Namespace>.json` in all four folders plus an import and an entry in all four `index.ts` files. A new key goes into all four locales in the same change.
- **`pnpm --filter web check-messages`** (`scripts/check-messages.mjs`) fails on any key missing from or extra to `en`, and on a namespace file its `index.ts` does not import. next-intl renders a missing key as its path instead of throwing, so this is the only thing that catches one.
- **The browser gets less than the server.** The root layout passes `publicClientMessages` to `NextIntlClientProvider`, which drops `Seo` (read only by `generateMetadata` and server components) and `Admin`. The `(admin)` layout mounts a nested provider with `adminClientMessages`, which keeps `Admin`; a nested provider replaces messages instead of merging, so it carries the public namespaces too. The lists in `src/i18n/messages.ts` name what to leave out, so a new namespace reaches the client by default. Before reading `Seo` from a client component, or `Admin` outside the `(admin)` group, change those lists, or the browser renders the key path.

## Mobile and breakpoints

- **Breakpoints are Tailwind's defaults**, and `globals.css` declares no `--breakpoint-*` of its own: `sm` 40rem (640px), `md` 48rem (768px), `lg` 64rem (1024px), `xl` 80rem (1280px), `2xl` 96rem (1536px). Styles are mobile-first: the bare class is the phone, a prefix adds from that width up. `md` is where the typography tokens switch to the desktop scale, `xl` is where the density dial and the desktop macro start. The only off-scale value in use is `max-[360px]:` for very narrow phones; do not add others without a design reason.
- **Prefer CSS.** Show, hide and restyle per breakpoint with `md:` / `max-md:` classes, which render correctly on the server and never flash. Two trees toggled with `hidden md:block` beat a hook every time the markup is cheap.
- **Reach for the hook only for behaviour CSS cannot express**: an imperative scroll, a measurement, a map offset. `useBreakpoint("lg")` from `@yacht-charter/ui/hooks/use-breakpoint` is the same test as `lg:` (`useMediaQuery(query)` for anything else). It answers `false` on the server and during hydration, then the real value, so never branch markup on it above the fold. `BREAKPOINTS` and `breakpointQuery` in `@yacht-charter/ui/lib/breakpoints` carry the values for code that needs a query string. Do not write `window.matchMedia` or `innerWidth` checks by hand.
- **Sheets.** A panel docked to a screen edge is `Sheet` from `@yacht-charter/ui/components/overlay/sheet` (Base UI drawer: swipe to dismiss, `side` = `bottom` | `top` | `left` | `right`, `showHandle`, `showClose`). A dialog that only becomes a bottom sheet on phones and is centred from `md` up stays `DialogContent mobileSheet`.
- **Shadows are tokens**, declared in the `@theme` block of `packages/ui/src/styles/globals.css`: `shadow-card` (cards, tooltip, banners), `shadow-popover` (menus, selects, popovers), `shadow-dialog` (dialogs and sheets), `shadow-brand-glow` (brand-blue map and route controls). Do not write a new `shadow-[...]` for one of these values. A new token also goes into the `extendTailwindMerge` list in `packages/ui/src/lib/utils.ts`, otherwise `cn()` treats it as a shadow colour and a `shadow-none` override stops working.

## Architecture (feature-module)

`apps/web` follows a **feature-module** architecture. Full decision + rationale live in the project vault (`decisions/ADR-001-web-feature-module-architecture`); this is the working summary.

### Structure

Every subfolder except `components/` and `types.ts` is optional — a feature adds
`hooks/`, `api/`, and `lib/` only when it needs them.

```
src/
  app/                    # routes only — compose features; no business logic
  features/
    <feature>/            # one self-contained domain feature
      index.ts            #   public API — outside code imports ONLY this
      components/         #   feature UI (private to the feature)
      types.ts            #   feature view-types (inferred from AppRouterClient)
      hooks/              #   optional — React hooks over the feature's queries
      api/                #   optional
        queries.ts        #     query/mutation option factories (shared by server + client)
        server.ts         #     server-only data / prefetch helpers
      lib/                #   optional — pure helpers (search-params, formatters, constants)
  components/
    shared/               # cross-feature components, grouped by purpose like packages/ui
      data-display/       #   yacht-card, prepayment-note, animated-number, image
      feedback/           #   empty-state, loader
      form/               #   date-picker, filters/
      layout/             #   split-panels
      navigation/         #   app-breadcrumbs
      overlay/            #   marina-popover
    layout/               # app shell / chrome
  hooks/                  # app-wide React hooks, feature-agnostic
  lib/                    # app-wide integrations & clients
  utils/                  # app-wide helpers
```

A feature too big for one flat `components/` splits into domain subfolders, each shaped like a
small feature (`components/`, `hooks/`, `api/`, `types.ts`) behind the one feature `index.ts`:
`features/admin/{fleet,bookings,inbox,content,finance,users,audit,settings}`, with what two or more
domains use in `features/admin/shared`. Domains import `shared`, never each other.

Data path: a route (server) prefetches through a feature's `api/server.ts`, which reuses
`api/queries.ts`; client leaves read the **same** `queries.ts` via a `hooks/` wrapper — one
definition, so server-prefetched and client cache keys always match.

### Rules

- **Dependencies flow one way:** `app → features → (components/shared, packages/ui, hooks, lib, utils)`. Never sideways or up.
- **Feature encapsulation:** import a feature only via `@/features/<name>` (its `index.ts`), never a deep path. Feature→feature imports are allowed only through the public index and only as an exception; if something is needed by 2+ features, promote it (framework-agnostic → `packages/ui`, else → `components/shared`).
- **Cross-feature composition happens in the route** (`app/**`), not inside a feature.

### Data (SSR-first)

- Data-loading pages are Server Components that prefetch on the server (`features/*/api/server.ts`) and wrap the subtree in **one** `HydrationBoundary` (via a `<Hydrated>` helper); client leaves read the **same** query through a hook. Prefetch several queries with `Promise.all`.
- `api/queries.ts` holds isomorphic `orpc.*.queryOptions()` factories used by **both** server prefetch and client hooks, so cache keys never drift. `api/server.ts` is server-only (`import "server-only"`).
- Only `api/` folders (a feature's, a shared component's, or `src/lib/api/` for what no feature owns) may import `orpc` from `@/utils/orpc`. Hooks and components import the factories. `no-restricted-imports` in `.oxlintrc.json` enforces it; `getQueryClient` is allowed anywhere.
- Pages with no server data skip prefetch entirely. Never hand-write request/response types — infer from `AppRouterClient`.

### Server vs Client

- Default to Server Components. Add `"use client"` only at leaves that use data hooks, state, events, or browser APIs; keep the boundary as low as possible.

### State

- Server state → TanStack Query. URL state (filters/search/sort/pagination) → **nuqs**, parsers in `features/<name>/lib/search-params.ts` (shared server+client via `createSearchParamsCache` / `useQueryStates`). Form and flow state (wizards) → **react-hook-form** (see **Forms** below). Ephemeral UI → `useState`. **No global store** — introduce one only when a concrete app-wide need appears.

### Forms

- **react-hook-form + Zod** is the only form library. It replaced `@tanstack/react-form`, which the Better-T-Stack scaffold shipped and which is no longer a dependency — do not reintroduce it.
- Compose with the shadcn-shaped primitives from `@yacht-charter/ui/components/form/form`: `Form` (= `FormProvider`) › `FormField` › `FormItem` › `FormLabel` / `FormControl` / `FormDescription` / `FormMessage`. `FormItem` mints the id and wires label ⇄ control ⇄ message through `aria-*`; `FormControl` clones those attributes onto its single child.
- Validate with `zodResolver` from `@hookform/resolvers/zod`. Build the schema inside a hook when the messages are translated, and memoise it — a new schema identity on every render re-registers the resolver.
- **Controls paint their error state off `aria-invalid="true"`**, not a `status` prop, because `FormControl` is what sets it. `TextField`, `Select` and `MultiSelect` already do; a new bordered control must too.
- Reading errors in a child component requires `useFormState({ control, name })` — `formState` off `useFormContext` subscribes the component that called `useForm`, so a nested step would never re-render.
- Multi-step flows keep **one** form and gate each step with `trigger("<step>")`. `trigger` marks nothing as touched, so a failed step must touch its own fields (`setValue(path, getValues(path), { shouldTouch: true })`) for `mode: "onTouched"` to go live afterwards — see `features/booking`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
