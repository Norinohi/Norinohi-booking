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
unique-constraint columns in alphabetical order rather than index order, so all ten
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

## Database suites

`*.db.test.ts` files run against a real Postgres, not mocks. Each suite calls
`createTestDatabase()` (`src/test-support/database.ts`), which creates a throwaway database,
applies the committed migrations from `src/migrations`, and drops it in `afterAll`. Building
from migrations rather than from the Drizzle schema means a schema edit nobody generated SQL
for fails here, not at deploy.

```bash
pnpm db:start   # the compose Postgres on 5434 is the default target
pnpm test:db    # only *.db.test.ts; plain `pnpm test` excludes them
```

`TEST_DATABASE_URL` points it elsewhere and must name a database the user can connect to in
order to create others (`.../postgres`). The server's `DATABASE_URL` is deliberately not read,
so a run can never create or drop anything beside real data. Fixtures are built per suite with
typed inserts; do not load `seed.ts`, which assumes an empty database with fixed ids.

`src/search/period-price.db.test.ts` pins the dated-search price path: the
`listing_period_price` projection, its agreement with `listing_search_doc`, and the sort, filter
and slider that read it. `list-rate.db.test.ts` pins the fallback for a dated week no vendor
priced: the operator's weekly list rate for that exact week (`list-rate-sql.ts`,
`price_source = 'price-list'`), ranked behind vendor prices and ahead of unpriced cards, and read
by the same sort, filter, slider and map pin. `nearest-priced-week.db.test.ts` pins the rebuild replacing a season
minimum with the nearest week a vendor priced, and `duration.db.test.ts` pins that a length
filter, dated or not, admits only listings with a free charter of that length and names one,
which short charters `listShortCharterPeriods` hands the NauSYS sweep, and that a card shows the
swept price of the charter it names.
Shared seeding for these lives in `src/test-support/search-fixture.ts`.
`src/search/catalogue-countries.db.test.ts` pins `listCatalogueCountries` (boats per country, with
the ISO code the planner builds its flag from) and the `country` and `region` filters on
`listPopularRoutes`.

## Routes and geo modules

Sailing-route data access lives in `src/routes/`, not in `src/search/`:

- `suggested-route.ts` - `suggestedRouteFor`, the itinerary a listing detail page shows.
- `popular-routes.ts` - `listPopularRoutes`, the home page slider (still re-exported through
  `@yacht-charter/db/search`).
- `library.ts` - the admin route library's reads and writes (target joins, stops, translations,
  stop renumbering). `packages/api/src/services/route-admin.ts` keeps the orchestration: audit
  log, domain errors, locale parsing and cache revalidation.
- `types.ts` - `SuggestedRoute`, re-exported from `search/types.ts` for `ListingDetail`.

Anything spatial goes in `src/geo/`, pure where it can be:

- `distance.ts` - `distanceKm` (haversine in TypeScript) and `distanceKmSql`, the same formula
  in SQL. Plain math functions: no PostGIS or earthdistance extension is installed, and adding
  one is its own migration.
- `bounds.ts` - `boundingBox` and `boundingBoxSql`, a cheap `lat`/`lng` prefilter that may keep
  points outside the radius but never drops one inside it (handles the antimeridian and poles).
- `nearest-marinas.ts` - `listNearestBases`, bounding box, then exact distance, then order.

A new route or map query belongs in one of these folders; `search/` is for the listing catalogue.
`geo/nearest-marinas.db.test.ts` pins the ordering, the `maxKm` cut and the listing counts.

## Conventions

- Schema files live in `src/schema/` and must be re-exported from `src/schema/index.ts` — `src/index.ts` passes `* as schema` into `drizzle()`, so a table missing from that barrel is invisible to the ORM.
- `src/schema/auth.ts` defines the better-auth tables (`user`, `session`, and the rest). Its shape is dictated by better-auth's Drizzle adapter, not by us — change it only alongside the config in `packages/auth/src/index.ts`, then `pnpm db:generate && pnpm db:migrate`.
- `drizzle.config.ts` loads env from `../../apps/server/.env`, not from this package. There is no `.env` here, and `DATABASE_URL` falls back to `""` if that file is missing — drizzle-kit commands then fail obscurely.
- `drizzle.config.ts` sets `out: "./src/migrations"`, so generated SQL lands inside `src/`. Never hand-edit files there once generated, and always commit it — `src/migrations` is what reaches production. Deployment applies it through `src/migrate.ts`. Editing an applied migration leaves every database that already ran it holding different SQL from the repository, which is why `0018_goofy_reaper` no longer matches its recorded hash; `db:baseline` reports that but cannot fix it.
- `src/migrate.ts` exports `runMigrations(migrationsFolder)` and takes the folder as an argument on purpose: consumers bundle this file, so an `import.meta.url` computed here would resolve to _their_ output location. `apps/server/src/migrate.ts` is the caller.
- `src/index.ts` exports both the `createDb()` factory and a `db` singleton. Prefer `createDb()` where lifecycle matters — `packages/auth` calls the factory.
- The compose project name, container name, and volume are all `yacht-charter`-prefixed. Renaming them orphans the existing local volume and its data.
- Curated seed and label data is JSON beside the module that owns it (`catalogue-routes.json`, `catalogue-stop-refresh.json`, `popular-routes.json`, `boat-types.json`, `site-faq.json`, `translations/*.json`). The module imports it `with { type: "json" }` and parses it with zod at load, keeping the exported name and type, so a hand edit that breaks the shape fails on import rather than halfway through a write. The `tsdown` bundle of `apps/server` inlines these imports. A JSON file cannot hold a comment, so a note on an entry is a `$comment` key, which the parse strips.
