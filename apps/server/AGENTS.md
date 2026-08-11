# AGENTS.md

These instructions apply to `apps/server` and layer on top of the repository root `AGENTS.md`.

## Scope

The Hono HTTP server (package name `server`) that hosts auth and both oRPC handlers. It is the only workspace that composes `@yacht-charter/api`, `@yacht-charter/auth`, and `@yacht-charter/db` together.

## Commands

```bash
pnpm dev:server                   # from repo root — tsx watch src/index.ts
pnpm --filter server build        # tsdown → dist/index.mjs
pnpm --filter server check-types  # tsc -b  (composite project)
pnpm --filter server start        # node dist/index.mjs
pnpm --filter server migrate      # node dist/migrate.mjs — applies packages/db/src/migrations
```

## Conventions

- `src/index.ts` is the server entry point and its middleware order is load-bearing: `evlog()` → the `identifyUser` auth-logging middleware → `cors` → `/api/auth/*` → the oRPC dispatch middleware → the `/` health route. Insert new middleware deliberately, not at the top.
- The oRPC middleware tries `rpcHandler` (prefix `/rpc`) first, then `apiHandler` (prefix `/api-reference`), calling `next()` only when neither matched. Preserve that fall-through.
- The `serve()` call reads `env.PORT`, which defaults to `3000` and is injected by the host in deployment. Do not hardcode it back — Railway routes traffic to the injected port. Changing the local default also means changing `CORS_ORIGIN`/`NEXT_PUBLIC_SERVER_URL` in the `.env` files.
- `GET /` is the deployment healthcheck (`apps/server/railway.json`). It must keep answering without a database round trip, so don't move it behind anything that queries.
- `src/migrate.ts` is the second entry point, run as Railway's pre-deploy step, not by the server process. It only resolves the migrations folder and delegates to `runMigrations` in `packages/db` — the Drizzle imports belong there, where `drizzle-orm` is a declared dependency. Its path hop (`../../../packages/db/src/migrations`) relies on `src/` and `dist/` both sitting one level under `apps/server`.
- `src/sync-catalogue.ts` and `src/sync-availability.ts` are one-off entry points for a manual sync run from the deployed container (`pnpm --filter server sync:catalogue` / `sync:availability`, or the equivalent `node dist/sync-*.mjs`). They call the same job functions `admin.provider.syncCatalogue`/`syncAvailability` fire off, but await them instead of returning immediately, so the run's summary prints before the process exits. Not part of the request/response path — run by hand, not started by `src/index.ts`.
- Business logic belongs in `packages/api` as procedures on `appRouter`, not in this app. This app only wires transport.
- `tsdown.config.ts` builds four entries (`src/index.ts`, `src/migrate.ts`, `src/sync-catalogue.ts`, `src/sync-availability.ts`) and sets `noExternal: [/@yacht-charter\/.*/]`, so workspace packages are bundled into `dist/`. New internal packages are covered by that pattern automatically. Anything _not_ listed in this app's `package.json` also gets inlined (that is how `drizzle-orm` and `pg` end up in the bundle); deps declared here stay external and must resolve from `node_modules` at runtime.
- `tsconfig.json` sets `composite: true` and `jsxImportSource: "hono/jsx"` — this app type-checks with `tsc -b`, not `--noEmit`.
