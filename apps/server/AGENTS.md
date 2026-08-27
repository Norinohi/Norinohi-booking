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
- `src/sync-catalogue.ts`, `src/sync-availability.ts`, `src/sweep-expiries.ts` and `src/payment-reminders.ts` are standalone entry points that run from the deployed container (`pnpm --filter server sync:catalogue` / `sync:availability` / `sweep:expiries` / `remind:payments`, or the equivalent `node dist/*.mjs`). They call the same functions the matching `/api/cron/*` route and admin procedure do, but await them instead of returning immediately, so the run's outcome reaches the exit code and the logs. Railway runs all four on a schedule as their own services (`docs/scheduled-jobs.md`); the routes remain as the manual escape hatch. Not part of the request/response path — never started by `src/index.ts`.
- **Every scheduled entry point starts with `startJob(name)` from `src/job.ts` and ends with `await job.done(metrics)` or, on the failure paths, `await job.failed(reason, metrics)` in front of the `process.exit(1)` that was already there.** That emits one wide event per run through the Sentry drain (`src/observability.ts`), which is the only thing that can page anybody about a 03:00 cron: a non-zero exit and a `console.log` are both read only after someone already suspects a problem. `job.failed` does not exit — the scripts own their exit code, since Railway reads non-zero as a Crashed run and the sync entry points deliberately exit `0` on a skipped provider. The by-hand scripts (`seed-facets.ts`, `publish-listings.ts`, `repair-bm-ids.ts`, `rebuild-search-docs.ts`) are exempt: an operator is watching them.
- **Every scheduled entry point must end with `await db.$client.end()`.** An idle pool client keeps the event loop open, so a job that finishes its work still never exits, and Railway treats a container that never exits as a run in progress and skips every later tick. `src/index.ts` is the exception: it is supposed to stay up.
- **A change to `packages/db/src/search/read-model.ts` needs `pnpm --filter server rebuild:search-docs` after it deploys.** `listing_search_doc` is a projection, and every other caller refreshes it scoped to the listings it just touched — right for a sync, wrong for a change to the projection SQL, which alters what every row should hold while touching no listing. Without the rebuild the fix is live on the detail page, which reads through, and stale on the search card, which reads the document. `src/rebuild-search-docs.ts` is the unscoped pass; it is one upsert over the published fleet and safe to repeat.
- Business logic belongs in `packages/api` as procedures on `appRouter`, not in this app. This app only wires transport.
- `tsdown.config.ts` builds every entry point listed above plus `src/seed-facets.ts`, `src/publish-listings.ts` and `src/rebuild-search-docs.ts`, and sets `noExternal: [/@yacht-charter\/.*/]`, so workspace packages are bundled into `dist/`. New internal packages are covered by that pattern automatically. Anything _not_ listed in this app's `package.json` also gets inlined (that is how `drizzle-orm` and `pg` end up in the bundle); deps declared here stay external and must resolve from `node_modules` at runtime.
- `tsconfig.json` sets `composite: true` and `jsxImportSource: "hono/jsx"` — this app type-checks with `tsc -b`, not `--noEmit`.
