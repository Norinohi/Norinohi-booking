# AGENTS.md

These instructions apply to `apps/web` and layer on top of the repository root `AGENTS.md`.

## Scope

The Next.js 16 App Router frontend (package name `web`), served on port 3001 with Turbopack. It renders UI, calls the server over oRPC, and owns no data access of its own.

## Commands

```bash
pnpm dev:web                 # from repo root
pnpm --filter web build      # next build
pnpm --filter web check-types  # tsc --noEmit
```

## Conventions

- `tsconfig.json` here does **not** extend `@yacht-charter/config/tsconfig.base.json` — it is Next's own config with the `next` plugin and `paths` for `@/*` and `@yacht-charter/ui/*`. Do not "fix" it to extend the base; the two disagree on `target`, `lib`, and `types` on purpose.
- Component placement (see **Architecture** below): framework-agnostic primitives → `packages/ui`; cross-feature but Next/app-coupled → `src/components/shared`; app chrome → `src/components/layout`; feature-specific → `src/features/<name>/components`. The `packages/ui`-vs-`shared` test: _"could it live in `packages/ui` without pulling in `next`?"_ — yes → `packages/ui`, no → `src/components/shared`.
- `src/components/shared` uses the **same category names as `packages/ui`** (`actions`, `data-display`, `feedback`, `form`, `layout`, `navigation`, `overlay`), so a component's category does not change when it is promoted between the two. Import with the full path: `@/components/shared/data-display/boat-card`. There is no barrel export.
- Never edit `next-env.d.ts` — Next regenerates it and the file says so.
- Server data goes through `src/utils/orpc.ts` (`client`, `orpc`, `queryClient`). Do not construct an `RPCLink` or a second `QueryClient` elsewhere; `src/components/layout/providers.tsx` already mounts the singleton (and the `NuqsAdapter`).
- Auth goes through `src/lib/auth-client.ts` (`authClient`). Preserve the `baseURL` comment there — the `/api/auth` path must match the server mount.
- `reactCompiler: true` and `typedRoutes: true` are enabled in `next.config.ts`. Route types are generated into `.next/`; standalone `tsc --noEmit` still passes without a build.
- `next.config.ts` imports `@yacht-charter/env/web` purely for its validation side effect — keep that import first.
- Logging is split across `src/lib/evlog.ts`, `instrumentation.ts`, and `src/proxy.ts`. Edit `src/lib/evlog.ts`; the other two delegate to it.

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
      data-display/       #   boat-card, booking-summary, prepayment-note, animated-number, image
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
