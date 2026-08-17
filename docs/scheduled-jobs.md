# Scheduled jobs

Three jobs keep a live provider catalogue current and stop expired holds from
selling a slot twice. None of them run on the `server` service itself: that
service answers requests, and a catalogue walk takes hours.

| Job | Cadence | Runs | Config |
| --- | --- | --- | --- |
| Catalogue sync | daily, 01:00 UTC | `pnpm --filter server sync:catalogue` | `apps/server/railway.cron-catalogue.json` |
| Availability sync | hourly | `pnpm --filter server sync:availability` | `apps/server/railway.cron-availability.json` |
| Expiry sweep | every 10 min | `POST /api/cron/sweep-expiries` | dashboard only, see below |

`0 1 * * *` is 02:00 CET in winter and 03:00 CEST in summer, both of which clear
the NauSYS request for one full dump a day after 01:00 GMT+1. Railway's cron
runs in UTC and enforces a minimum gap between runs (5 minutes at the time of
writing), so the sweep can go faster than 10 minutes but not much.

## The two repo-built cron services

Each is a Railway service in the same project, built from this repo. Create them
in the dashboard, then point each one's config-as-code path at its file above.
Railway cannot create a service from a committed file, so that part is manual;
everything else about the deployment is in the file.

Three differences from `apps/server/railway.json`, all deliberate:

- **No `preDeployCommand`.** Migrations belong to the `server` service alone.
  Three services racing `drizzle-kit migrate` at deploy time is a way to corrupt
  the ledger, not a way to be safe.
- **No healthcheck.** These processes never open a port, so a healthcheck would
  fail every run.
- **`restartPolicyType: NEVER`.** A cron process that finishes has succeeded.
  `ON_FAILURE` would read the exit as a crash and restart the sync in a loop.

They also watch `packages/providers/**`, which the `server` service does not:
the provider adapters are what these two actually run.

Set the same variables Railway holds for `server`:

```
DATABASE_URL
PROVIDER_MODE=nausys
NAUSYS_BASE_URL
NAUSYS_USERNAME
NAUSYS_PASSWORD
PROVIDER_AUTO_PUBLISH=nausys
REVALIDATE_SECRET
```

`CRON_SECRET` is not needed here. These run the job directly rather than calling
the HTTP route, so there is no request to authenticate.

## The sweep service

`sweepExpiries` has no compiled entry point, only the route in
`apps/server/src/index.ts`, so this one calls over HTTP. Railway's config schema
covers builds from source but not image-sourced services, which is why this has
no file in the repo. Create it in the dashboard from the `curlimages/curl`
image, with cron schedule `*/10 * * * *` and start command:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$SERVER_URL/api/cron/sweep-expiries"
```

Set `CRON_SECRET` (matching the `server` service, minimum 16 characters) and
`SERVER_URL`. Without `CRON_SECRET` on the server the route answers 503 rather
than running unauthenticated.

If it becomes worth having this as an ops script like the other two, add
`src/sweep-expiries.ts` and a `tsdown` entry, and this service turns into a
third repo-built one.

## What a green run does and does not mean

The `/api/cron/sync-catalogue` and `/api/cron/sync-availability` routes start the
job and return the run ids immediately, because a full walk outlives any platform
request timeout. The two cron services above call the job functions directly and
await them, so their exit code does reflect the outcome and their logs carry the
summary. That is the reason to prefer them over curling the routes.

Progress and failures land in `sync_run` and `sync_error` either way. Poll
`admin.provider.syncStatus` to follow a run.

Overlap is safe. A provider with a run already in flight is reported as not
started rather than failing, and the NauSYS queue serializes every call on one
credential, so an hourly availability run colliding with a still-running nightly
catalogue walk just skips that hour.
