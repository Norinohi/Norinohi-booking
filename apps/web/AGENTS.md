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
- Component placement (see **Architecture** below): framework-agnostic primitives → `packages/ui`; cross-feature but Next/app-coupled → `src/components/shared`; app chrome → `src/components/layout`; feature-specific → `src/features/<name>/components`. The `packages/ui`-vs-`shared` test: *"could it live in `packages/ui` without pulling in `next`?"* — yes → `packages/ui`, no → `src/components/shared`.
- Never edit `next-env.d.ts` — Next regenerates it and the file says so.
- Server data goes through `src/utils/orpc.ts` (`client`, `orpc`, `queryClient`). Do not construct an `RPCLink` or a second `QueryClient` elsewhere; `src/components/layout/providers.tsx` already mounts the singleton (and the `NuqsAdapter`).
- Auth goes through `src/lib/auth-client.ts` (`authClient`). Preserve the `baseURL` comment there — the `/api/auth` path must match the server mount.
- `reactCompiler: true` and `typedRoutes: true` are enabled in `next.config.ts`. Route types are generated into `.next/`; standalone `tsc --noEmit` still passes without a build.
- `next.config.ts` imports `@yacht-charter/env/web` purely for its validation side effect — keep that import first.
- Logging is split across `src/lib/evlog.ts`, `instrumentation.ts`, and `src/proxy.ts`. Edit `src/lib/evlog.ts`; the other two delegate to it.

## Architecture (feature-module)

`apps/web` follows a **feature-module** architecture. Full decision + rationale live in the project vault (`decisions/ADR-001-web-feature-module-architecture`); this is the working summary.

### Structure

```
src/
  app/                      # thin routes = composition roots (prefetch + compose features)
  features/<name>/
    index.ts                # PUBLIC API — the only thing outside code may import
    components/             # feature UI (private)
    types.ts                # feature view-types (inferred from AppRouterClient)
    hooks/                  # optional — React glue over queries
    api/                    # optional — queries.ts (isomorphic defs) + server.ts (server-only prefetch)
    lib/                    # optional — pure helpers: search-params.ts (nuqs), formatters, constants
  components/
    shared/                 # cross-feature, Next/app-coupled (image, loader)
    layout/                 # app chrome (header, providers, theme-provider, mode-toggle, user-menu)
  lib/ utils/               # inherited integrations (auth-client, evlog, orpc)
```

### Rules

- **Dependencies flow one way:** `app → features → (components/shared, packages/ui, lib, utils)`. Never sideways or up.
- **Feature encapsulation:** import a feature only via `@/features/<name>` (its `index.ts`), never a deep path. Feature→feature imports are allowed only through the public index and only as an exception; if something is needed by 2+ features, promote it (framework-agnostic → `packages/ui`, else → `components/shared`).
- **Cross-feature composition happens in the route** (`app/**`), not inside a feature.

### Data (SSR-first)

- Data-loading pages are Server Components that prefetch on the server (`features/*/api/server.ts`) and wrap the subtree in **one** `HydrationBoundary` (via a `<Hydrated>` helper); client leaves read the **same** query through a hook. Prefetch several queries with `Promise.all`.
- `api/queries.ts` holds isomorphic `orpc.*.queryOptions()` factories used by **both** server prefetch and client hooks, so cache keys never drift. `api/server.ts` is server-only (`import "server-only"`).
- Pages with no server data skip prefetch entirely. Never hand-write request/response types — infer from `AppRouterClient`.

### Server vs Client

- Default to Server Components. Add `"use client"` only at leaves that use data hooks, state, events, or browser APIs; keep the boundary as low as possible.

### State

- Server state → TanStack Query. URL state (filters/search/sort/pagination) → **nuqs**, parsers in `features/<name>/lib/search-params.ts` (shared server+client via `createSearchParamsCache` / `useQueryStates`). Flow state (wizards) → scoped React Context + TanStack Form. Ephemeral UI → `useState`. **No global store** — introduce one only when a concrete app-wide need appears.
