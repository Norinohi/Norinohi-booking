# AGENTS.md

These instructions apply to `packages/db` and layer on top of the repository root `AGENTS.md`.

## Scope

Drizzle ORM schema and the Postgres connection, plus the Docker Compose definition for local Postgres. Consumed by `packages/auth` and, through it, the server.

## Commands

Run these from the repo root (`pnpm db:*` proxies here), or directly with `--filter @yacht-charter/db`. Local Postgres is `postgres:18` on host port `5432`, database `yacht-charter`, user `postgres`.

```bash
pnpm db:start     # docker compose up -d
pnpm db:generate  # writes the next SQL file into src/migrations/
pnpm db:migrate   # applies them — the local loop, same path production takes
pnpm db:baseline  # repairs a ledger left behind by db:push (see below)
```

**`db:push` does not work against this schema** on drizzle-kit 0.31.10, and reordering
our constraints to make it work would be the wrong trade. Its introspection returns
unique-constraint columns in alphabetical order rather than index order, so all nine
of our non-alphabetical unique constraints look absent — `listing_amenity_uq` reads
back as `(amenity_id, listing_id)` when the database holds `(listing_id, amenity_id)`.
Push then offers to truncate the table, and adding the constraint fails either way
with `relation "listing_amenity_uq" already exists`. Rewriting them alphabetically
would mangle real index ordering (`availability_slot_period_uq` would lead on
`end_date`), so the schema stays as written and `generate` + `migrate` is the loop.
Worth re-testing when drizzle-kit 1.0 leaves rc.

### Repairing a database built with `db:push`

`db:push` writes schema straight to Postgres and never records anything in
`drizzle.__drizzle_migrations`. A database built that way looks untouched to
`db:migrate`, which then replays migrations against objects that already exist and
dies on the first `CREATE TABLE`. `pnpm db:baseline` writes the missing ledger rows
with the hash and timestamp drizzle expects; it prints what it would do and changes
nothing until you pass `--apply`:

```bash
pnpm db:baseline           # dry run — lists what is missing from the ledger
pnpm db:baseline --apply   # records them, then db:migrate is a no-op
```

It asserts nothing about the schema, because a migration is arbitrary SQL: only run
it when the database really is current. It refuses to run with `NODE_ENV=production`,
where the ledger has only ever been written by real migrations and marking one
applied would skip it forever. It also warns when a recorded migration's SQL has
changed since it ran, which a baseline cannot repair.

## Conventions

- Schema files live in `src/schema/` and must be re-exported from `src/schema/index.ts` — `src/index.ts` passes `* as schema` into `drizzle()`, so a table missing from that barrel is invisible to the ORM.
- `src/schema/auth.ts` defines the better-auth tables (`user`, `session`, and the rest). Its shape is dictated by better-auth's Drizzle adapter, not by us — change it only alongside the config in `packages/auth/src/index.ts`, then `pnpm db:generate && pnpm db:migrate`.
- `drizzle.config.ts` loads env from `../../apps/server/.env`, not from this package. There is no `.env` here, and `DATABASE_URL` falls back to `""` if that file is missing — drizzle-kit commands then fail obscurely.
- `drizzle.config.ts` sets `out: "./src/migrations"`, so generated SQL lands inside `src/`. Never hand-edit files there once generated, and always commit it — `src/migrations` is what reaches production. Deployment applies it through `src/migrate.ts`. Editing an applied migration leaves every database that already ran it holding different SQL from the repository, which is why `0018_goofy_reaper` no longer matches its recorded hash; `db:baseline` reports that but cannot fix it.
- `src/migrate.ts` exports `runMigrations(migrationsFolder)` and takes the folder as an argument on purpose: consumers bundle this file, so an `import.meta.url` computed here would resolve to _their_ output location. `apps/server/src/migrate.ts` is the caller.
- `src/index.ts` exports both the `createDb()` factory and a `db` singleton. Prefer `createDb()` where lifecycle matters — `packages/auth` calls the factory.
- The compose project name, container name, and volume are all `yacht-charter`-prefixed. Renaming them orphans the existing local volume and its data.
