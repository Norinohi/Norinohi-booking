# AGENTS.md

These instructions apply to `packages/db` and layer on top of the repository root `AGENTS.md`.

## Scope

Drizzle ORM schema and the Postgres connection, plus the Docker Compose definition for local Postgres. Consumed by `packages/auth` and, through it, the server.

## Commands

Run these from the repo root (`pnpm db:*` proxies here), or directly with `--filter @yacht-charter/db`. Local Postgres is `postgres:18` on host port `5432`, database `yacht-charter`, user `postgres`.

```bash
pnpm db:start     # docker compose up -d
pnpm db:push      # fastest loop in development — no migration files
pnpm db:generate  # writes the next SQL file into src/migrations/
```

## Conventions

- Schema files live in `src/schema/` and must be re-exported from `src/schema/index.ts` — `src/index.ts` passes `* as schema` into `drizzle()`, so a table missing from that barrel is invisible to the ORM.
- `src/schema/auth.ts` defines the better-auth tables (`user`, `session`, and the rest). Its shape is dictated by better-auth's Drizzle adapter, not by us — change it only alongside the config in `packages/auth/src/index.ts`, then run `pnpm db:push`.
- `drizzle.config.ts` loads env from `../../apps/server/.env`, not from this package. There is no `.env` here, and `DATABASE_URL` falls back to `""` if that file is missing — drizzle-kit commands then fail obscurely.
- `drizzle.config.ts` sets `out: "./src/migrations"`, so generated SQL lands inside `src/`. Never hand-edit files there once generated, and always commit it — `src/migrations` is what reaches production. Deployment applies it through `src/migrate.ts`; `db:push` is a local shortcut that never runs there, so schema changed only via `push` will be missing in production.
- `src/migrate.ts` exports `runMigrations(migrationsFolder)` and takes the folder as an argument on purpose: consumers bundle this file, so an `import.meta.url` computed here would resolve to _their_ output location. `apps/server/src/migrate.ts` is the caller.
- `src/index.ts` exports both the `createDb()` factory and a `db` singleton. Prefer `createDb()` where lifecycle matters — `packages/auth` calls the factory.
- The compose project name, container name, and volume are all `yacht-charter`-prefixed. Renaming them orphans the existing local volume and its data.
