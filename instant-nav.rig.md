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
