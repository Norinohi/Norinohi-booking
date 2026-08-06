# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Commands

Package manager is `pnpm@10.31.0` (pinned via `packageManager` in the root `package.json`; lockfile is `pnpm-lock.yaml`). Every root script delegates to Turborepo, which reads `turbo.json`. Per-workspace scripts live in each workspace's own `package.json`.

```bash
pnpm install                 # install all workspaces
pnpm dev                     # turbo run dev — starts web (:3001) and server (:3000)
pnpm dev:web                 # web only, Next.js on http://localhost:3001
pnpm dev:server              # server only, Hono on http://localhost:3000
pnpm build                   # turbo run build — next build + tsdown
pnpm check-types             # turbo run check-types — 6 tasks: web, server, api, db, providers, @yacht-charter/ui
pnpm check                   # oxlint && oxfmt --write — NOTE: --write mutates files
pnpm test                    # turbo run test — vitest in api, db, providers
```

Database tasks all proxy to `@yacht-charter/db`; Postgres runs via `packages/db/docker-compose.yml`:

```bash
pnpm db:start                # docker compose up -d  (postgres:18, host port 5432)
pnpm db:stop                 # docker compose stop
pnpm db:down                 # docker compose down
pnpm db:push                 # drizzle-kit push — schema straight to DB, no migration files
pnpm db:generate             # drizzle-kit generate — writes packages/db/src/migrations
pnpm db:migrate              # drizzle-kit migrate
pnpm db:studio               # drizzle-kit studio
```

Absent by design or not yet built — do not invent these:

- **No CI.** There is no `.github/` directory and no pipeline config. `pnpm check`, `pnpm check-types`, `pnpm test`, and `pnpm build` are the only gates, and they are run manually. A push does trigger a Railway deploy (see `docs/railway-deployment.md`), but that runs no checks — a type error reaches production.
- **No `lint` script.** `turbo.json` declares a `lint` task, but no workspace defines one, so `turbo run lint` is a no-op. Linting happens only through the root `pnpm check`.

## Architecture

Nine pnpm workspace projects: two apps (`apps/web`, `apps/server`) and six packages (`packages/{api,auth,db,env,ui,config}`), plus the root. The web app never talks to the database — it calls the server over oRPC, and the server composes `packages/api`, `packages/auth`, and `packages/db`.

### API layer — the seam

`packages/api` is the contract every other workspace depends on.

- `packages/api/src/index.ts` defines `o` (the oRPC builder bound to `Context`), `publicProcedure`, and `protectedProcedure`. `protectedProcedure` applies a `requireAuth` middleware that throws `ORPCError("UNAUTHORIZED")` when `context.session?.user` is missing.
- `packages/api/src/routers/index.ts` exports `appRouter` plus the `AppRouter` and `AppRouterClient` types.
- `packages/api/src/context.ts` exports `createContext` and the `Context` type; it resolves the session via `auth.api.getSession`.
- `apps/server/src/index.ts` mounts `RPCHandler` at prefix `/rpc` and `OpenAPIHandler` at `/api-reference`.
- `apps/web/src/utils/orpc.ts` types its client as `AppRouterClient` and exports `client` and `orpc`.

Type safety flows client-to-server through `AppRouterClient`. Never hand-write request/response types on the web side — add the procedure to `appRouter` and let inference carry it.

### Auth

`packages/auth/src/index.ts` exports `createAuth()` and the `auth` singleton, wiring `betterAuth` to `drizzleAdapter` with the schema from `@yacht-charter/db/schema/auth`. The server mounts it with `app.on(["POST", "GET"], "/api/auth/*", ...)`.

The client half is `apps/web/src/lib/auth-client.ts`, whose `baseURL` carries an explicit comment: better-auth derives its route matching from that URL's path, so the public auth path must equal the server mount — `/api/auth` on both sides. Changing one without the other silently breaks auth.

Adding a better-auth plugin that needs tables means editing `packages/db/src/schema/auth.ts` and re-running `pnpm db:push`.

### Env validation

`packages/env` exports two subpaths, `@yacht-charter/env/server` and `@yacht-charter/env/web`, built with `@t3-oss/env-core` and `@t3-oss/env-nextjs`. Server vars: `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32 chars), `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NODE_ENV`, `PORT` (defaults to 3000; hosts inject it). Web exposes `NEXT_PUBLIC_SERVER_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, and `NEXT_PUBLIC_MAPBOX_TOKEN` (must be a `pk.` token).

`apps/web/next.config.ts` imports `@yacht-charter/env/web` for its validation side effect, so a bad web env fails the build early. Both schemas honour `SKIP_ENV_VALIDATION`. Read env through these modules — do not reach for `process.env` directly in app code. Copy `apps/web/.env.example` → `.env.local` and `apps/server/.env.example` → `.env` to get started; both mirror these schemas.

### Shared versions and TypeScript config

- The `catalog:` block in `pnpm-workspace.yaml` is the single source of truth for shared dependency versions. When a manifest says `"react": "catalog:"`, bump the catalog — never pin a version inside a workspace `package.json`.
- `packages/config/tsconfig.base.json` is extended by every tsconfig **except** `apps/web/tsconfig.json`, which is Next's own standalone config. Compiler-option changes meant for everyone go in the base file.
- `typescript` is deliberately held at `^6.0.3` while 7.x is published. Next.js 16.2.11 loads the TypeScript compiler API via `typescript/lib/typescript.js`, which TS 7 removed, so `next dev` and `next build` break on TS 7. Do not "fix" this by bumping the catalog.

### Logging

`evlog` is wired in three places: `initLogger` in `apps/server/src/index.ts`, `createEvlog`/`createInstrumentation` in `apps/web/src/lib/evlog.ts`, and `evlogMiddleware` in `apps/web/src/proxy.ts` (matcher `/api/:path*`). `apps/web/instrumentation.ts` defers to `src/lib/evlog`.

### Deployment

Railway, three services (`Postgres`, `server`, `web`), each app configured by its own
`apps/*/railway.json` with the repo root as build context. Full runbook and the variables to set:
`docs/railway-deployment.md`.

Two things constrain code changes here:

- **The server must not hardcode its port.** Railway injects `PORT`; `serve()` reads it through
  `env.PORT`. The same applies to any future listener.
- **Schema reaches production only through committed SQL.** `apps/server`'s pre-deploy step runs
  `node dist/migrate.mjs` (the second `tsdown` entry), which applies `packages/db/src/migrations`
  via `runMigrations` from `packages/db/src/migrate.ts`. A schema edit that is not accompanied by
  `pnpm db:generate` output deploys against the old tables. `db:push` is a local-only shortcut.

## Conventions

- Commit messages follow Conventional Commits, lowercase after the type — `chore: properly name project`. Every commit since the two scaffold commits (`initial commit`, `first commit`) has used `chore:`; no other type has been used yet.
- Import shared UI from its subpath: `@yacht-charter/ui/components/button`. There is no barrel export.
- Never hand-edit `apps/web/next-env.d.ts` (Next generates it; it says so) or `pnpm-lock.yaml` (pnpm owns it).
- Add shared shadcn primitives from the repo root with `npx shadcn@latest add <name> -c packages/ui`; run the CLI from `apps/web` only for app-specific blocks.
- Run `pnpm check` before committing. It rewrites files with `oxfmt --write`, so review the diff afterwards. Oxlint enforces the `correctness` category as errors via `.oxlintrc.json`.
- The vendored skills under `.agents/skills/` and `.claude/skills/` are tracked in git and hash-locked by `skills-lock.json`. Treat them as vendored — do not edit in place.
- Ports in development: web `3001` (`--port 3001` flag), server `3000` (the `PORT` default in `packages/env/src/server.ts`). `CORS_ORIGIN` and `NEXT_PUBLIC_SERVER_URL` must agree with them.
- Scaffolded by Better-T-Stack; `bts.jsonc` records the version and the exact `reproducibleCommand` that generated the project.
