# instant-nav rig: yacht-charter (apps/web)

How this repo produces a trustworthy instant-navigation verdict. Written once; every later run
reads this instead of rediscovering. Decision record: `docs/adr/0003`.

- **BUILD**: `pnpm --filter web build:test` (= `EXPOSE_TESTING_API=1 next build`), served by
  `pnpm --filter web start` on **:3001**. Never `next dev` — it does not prefetch, so a verdict
  taken there is invalid. The app calls the Hono API, so a run also needs Postgres up
  (`pnpm db:start`) and the server on **:3000** (`pnpm dev:server`, or built + `pnpm --filter
server start`).
- **EXPOSE**: `experimental.exposeTestingApiInProductionBuild: process.env.EXPOSE_TESTING_API === "1"`
  in `apps/web/next.config.ts`. Set only by `build:test` and by CI. **Never true in a production
  deploy** — Railway does not set it. Without it `instant()` silently no-ops and the suite passes
  vacuously.
- **RUN**: `pnpm --filter web test:e2e` (`playwright test`), `BASE_URL` defaulting to
  `http://localhost:3001`. Two projects, `desktop` (1280×800) and `mobile` (Pixel 7), because a
  shell that only matches the real render at one breakpoint is a skeleton mismatch.
- **TEST USER**: **anonymous.** All four target routes (`/`, `/yachts`, `/yachts/[id]`,
  `/plan-my-trip`) are public and every read behind them is a `publicProcedure`. There is no login
  helper and none is needed yet. When a protected route is guarded, the session must be injected
  via `storageState` **without navigating `page`** — a login helper that calls `page.goto` completes
  its navigation before `instant()` takes the lock, so the measurement is lost.
- **DRIFT** — everything that can differ between an author's browser and the suite, each a way a
  RED can lie:
  - **Locale.** Three shells per route (`en`/`es`/`uk`). A marker asserted in one locale may not
    exist in another; the suite drives `/en` unless a test says otherwise.
  - **Seeded data.** Facets, result cards and detail pages come from `listing_search_doc`. An empty
    or reseeded database changes what renders, and an empty-state shell is not the shell you meant
    to guard.
  - **API reachability.** If the server on :3000 is down, public routes render their empty state
    rather than failing loudly — a silent source of false verdicts.
  - **Currency.** Query options pin `EUR`; prices in another currency shift layout.
  - **Auth state.** The nav bar's `UserMenu` differs anonymous vs signed-in.
  - **Viewport.** Desktop and mobile shells differ; both projects must pass.
- **LOOP**: local — free :3001 → `build:test` → `start` → `test:e2e` → read failure → fix → repeat.
  CI — `.github/workflows/ci.yml` does the same in one job on pull requests. Fully agent-drivable:
  nothing to deploy, no secrets, no approval gates.
- **LIVENESS**: **n/a.** Both loops build and serve the artifact in the same job, so there is no
  deployed build that could be stale. If this ever moves to a preview deploy, add a SHA-echoing
  probe before trusting any verdict.

## WALLS

Project-specific obstacles, each hit for real. Read before debugging a strange verdict.

1. **Orphaned `next start` processes silently serve a stale build.** `playwright.config.ts` sets
   `reuseExistingServer: !CI`, so anything already listening on :3001 is reused — including a
   server left over from an earlier build. This produced two contradictory verdicts before it was
   spotted. Always free the port first and confirm it is empty:

   ```bash
   lsof -ti:3001 | xargs kill -9 2>/dev/null; sleep 1; lsof -ti:3001   # must print nothing
   ```

   `pkill -f "next start"` is not reliable here — it missed three live processes.

2. **A stale `next dev` server breaks `tsc`.** `apps/web/tsconfig.json` includes
   `.next/dev/types/**/*.ts`. A dev server left running from an older checkout keeps regenerating
   that directory against the old route tree, and `pnpm check-types` then fails on modules that no
   longer exist. Stop the dev server and `rm -rf .next` before trusting a type error.

3. **Postgres is on port 5434, not 5432.** `packages/db/docker-compose.yml` publishes `5434:5432`
   and `apps/server/.env` uses 5434. Both the root `AGENTS.md` and `apps/server/.env.example` say
   5432 — they are wrong.

4. **`pnpm check` rewrites the vendored skills.** `oxfmt --write` reformats the markdown under
   `.agents/skills/` and `.claude/skills/`, which `skills-lock.json` hash-locks and `AGENTS.md`
   says not to edit. Revert those paths after running it:

   ```bash
   git checkout -- .agents/skills .claude/skills
   ```

5. **`export const instant = false` disables the lock for that route.** While a route carries the
   opt-out, `instant()` has nothing to enforce and a navigation test on it passes vacuously. A
   route's guard is only meaningful once its opt-out is removed — which is also the moment the
   build starts reporting its blocking reads.

6. **The build now needs the API server running.** Once a route's catalog reads are cached, those
   reads execute during prerender to fill the static shell, so `next build` calls the Hono server
   on :3000. Without it the build dies with a bare `TypeError: fetch failed` that names nothing.
   Start Postgres and the server first (`pnpm db:start`, `pnpm dev:server`). CI already does this —
   see the "Start API server" step in `.github/workflows/ci.yml`.

7. **Killing port 3001 kills `pnpm dev` entirely.** Turbo runs web and server as children of one
   process, so freeing :3001 (WALL 1) also stops the API on :3000. Restart with `pnpm dev`, or run
   `pnpm dev:server` alone when you only need the API for a build.

8. **`.next/cache` survives rebuilds, so a data fix can look like it did nothing.** `"use cache"`
   entries persist across `next build`. After changing seed or database content that a cached read
   returns, a plain rebuild keeps serving the old value until its tier expires — facets are on
   `days`. Clear it when a data change must show up now:

   ```bash
   rm -rf apps/web/.next/cache
   ```

9. **Errors thrown out of a `"use cache"` function are serialized.** The caller receives a plain
   `Error` with a digest, so `instanceof` checks on the far side silently fail — a cached read that
   threw `ORPCError(NOT_FOUND)` reached its `catch` as an unrecognised error and became an
   unhandled render error instead of a 404. Decide inside the cached function and return the
   outcome as a value (`{ found: false }`), where the real error still exists.

10. **A `◐` route cannot return a non-200 status.** Under partial prerendering the shell is flushed
    before the dynamic part resolves — the response carries `x-nextjs-postponed: 1` — so a later
    `notFound()` swaps the UI but the status is already committed as 200. `connection()` in the
    _page_ does not change this, because the _layout's_ shell is what flushed. A correct 404 needs
    the whole route out of prerendering, which today means the root layout too.

11. **`tsc` passes locally and fails in CI on a fresh clone.** `next-env.d.ts` and `.next/types/*`
    carry the `*.png` and route-type declarations and are gitignored, so they exist on your machine
    only as a leftover from a previous build. `check-types` runs `next typegen` first for exactly
    this reason. Reproduce a CI checkout with:

    ```bash
    rm -f apps/web/next-env.d.ts && rm -rf apps/web/.next
    ```

12. **Turborepo strips env vars the task did not declare.** Turbo runs tasks in strict env mode, so
    an env var exported by a CI job (or your shell) never reaches a task unless it appears in
    `globalEnv` or that task's `env` in `turbo.json`. CI set `SKIP_ENV_VALIDATION=1` and
    `next typegen` still died on `Invalid environment variables`, because turbo had removed it.
    `NEXT_PUBLIC_*` is declared on `build` for the same reason plus cache correctness — those values
    are inlined into the client bundle, so a build cached under different ones must not be replayed.
    Reproduce the CI environment exactly with:

    ```bash
    mv apps/web/.env /tmp/ && SKIP_ENV_VALIDATION=1 pnpm exec turbo run check-types --force
    ```

    `--force` matters: a cache hit replays a previous success and hides the failure.

13. **Never put `--port` in the `start` script.** Railway injects `PORT` and probes that port; a
    hardcoded `--port 3001` in `apps/web`'s `start` makes the app listen elsewhere and the deploy
    fails its healthcheck with nothing useful in the logs. The rig pins the port through
    `playwright.config.ts`'s `webServer.env` instead. Root `AGENTS.md` states this constraint for
    the API server; it applies to the web app too.

14. **The healthcheck path must not be `/`.** Since locale moved into the URL, `/` is a 307 to
    `/en`, which does not satisfy a healthcheck. `apps/web/railway.json` probes `/en`.

15. **Dev mode re-fetches what production serves from cache.** `"use cache"` entries are invalidated
    by every HMR recompile, so `pnpm dev` shows repeated `/rpc/charterSearch/*` calls on each page
    load. That is not a caching bug — measure caching against `build:test` + `start`, where home
    issues no catalog requests at all.
