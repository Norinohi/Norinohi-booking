# Scheduled jobs

Three jobs keep a live provider catalogue current and stop expired holds from
selling a slot twice. None of them run on the `server` service itself: that
service answers requests, and a catalogue walk takes hours.

| Job | Cadence | Runs | Config |
| --- | --- | --- | --- |
| Catalogue sync | daily, 01:00 UTC | `pnpm --filter server sync:catalogue` | `apps/server/railway.cron-catalogue.json` |
| Availability sync | hourly | `pnpm --filter server sync:availability` | `apps/server/railway.cron-availability.json` |
| Expiry sweep | every 10 min | `pnpm --filter server sweep:expiries` | `apps/server/railway.cron-sweep.json` |

`0 1 * * *` is 02:00 CET in winter and 03:00 CEST in summer, both of which clear
the NauSYS request for one full dump a day after 01:00 GMT+1. Railway's cron
runs in UTC and enforces a minimum gap between runs (5 minutes at the time of
writing), so the sweep can go faster than 10 minutes but not much.

## The three cron services

Each is a Railway service in the same project, built from this repo, and all
three are created the same way. Add the service in the dashboard, then point its
config-as-code path at its file above. Railway cannot create a service from a
committed file, so that part is manual; everything else about the deployment is
in the file.

The long-running server service is called `api` in Railway, though its workspace
is `apps/server`; the variable references below name the service, not the folder.

Three differences from `apps/server/railway.json`, all deliberate:

- **No `preDeployCommand`.** Migrations belong to the `server` service alone.
  Three services racing `drizzle-kit migrate` at deploy time is a way to corrupt
  the ledger, not a way to be safe.
- **No healthcheck.** These processes never open a port, so a healthcheck would
  fail every run.
- **`restartPolicyType: NEVER`.** A cron process that finishes has succeeded.
  `ON_FAILURE` would read the exit as a crash and restart the sync in a loop.

They also watch `packages/providers/**`, which the `server` service does not:
the provider adapters are what these three actually run.

Each entry point ends with `await db.$client.end()`, and that line is what makes
a scheduled run possible at all. An idle pool client keeps the event loop open,
so without it the container runs the job, prints its summary and then sits there
forever. Railway reads that as a run still in progress and skips every tick
behind it, which looks like a cron that fired once and died. Any future entry
point on this schedule needs the same closing line.

All three import `@yacht-charter/env/server`, which validates the whole
schema at import time, not the subset a sync happens to read. Four variables have
no default and no `.optional()`, so a cron service missing any of them dies on a
Zod error before it opens a database connection:

```
DATABASE_URL           ${{Postgres.DATABASE_URL}}
BETTER_AUTH_SECRET     ${{api.BETTER_AUTH_SECRET}}
BETTER_AUTH_URL        ${{api.BETTER_AUTH_URL}}
CORS_ORIGIN            ${{api.CORS_ORIGIN}}
```

`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are dead weight in a process that
never serves a request; they are here only because the env module is all or
nothing. `CORS_ORIGIN` is not: `revalidateCatalogCache` builds the web app's
`/api/revalidate` URL from it, on the reasoning that an origin auth already
depends on cannot drift.

Then what the jobs actually use:

```
PROVIDER_MODE=nausys
NAUSYS_BASE_URL        ${{api.NAUSYS_BASE_URL}}
NAUSYS_USERNAME        ${{api.NAUSYS_USERNAME}}
NAUSYS_PASSWORD        ${{api.NAUSYS_PASSWORD}}
PROVIDER_AUTO_PUBLISH=nausys
REVALIDATE_SECRET      ${{api.REVALIDATE_SECRET}}
```

Reference the `api` service rather than pasting values, so a rotated credential
reaches all three services at once. `CRON_SECRET` is not needed: these run the
job directly rather than calling the HTTP route, so there is no request to
authenticate.

## The HTTP routes are still there

`/api/cron/sweep-expiries`, `/api/cron/sync-catalogue` and
`/api/cron/sync-availability` are unchanged and still guarded by `CRON_SECRET`.
They are the manual escape hatch: clearing a stuck hold, or kicking a sync,
without waiting for the next tick. Nothing schedules them.

Prefer the services above for anything scheduled. The two sync routes start the
job and return the run ids immediately, because a full walk outlives any platform
request timeout, so a 200 from them says only that the job was accepted. The
entry points await the job instead, which is why their exit code and logs mean
something.

`sweep-expiries.ts` goes one step further and exits non-zero when a provider
release failed, so a red run in Railway is the signal. Our side of that booking
expired either way; the vendor is still holding the option. Stale confirmations
do not fail the run, since `expiry.ts` reports rather than moves them precisely
because guessing either way is wrong.

## What a green run does and does not mean

Progress and failures land in `sync_run` and `sync_error` either way. Poll
`admin.provider.syncStatus` to follow a run.

Overlap is safe. A provider with a run already in flight is reported as not
started rather than failing, and the NauSYS queue serializes every call on one
credential, so an hourly availability run colliding with a still-running nightly
catalogue walk just skips that hour.
