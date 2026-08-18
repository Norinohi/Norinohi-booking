# Scheduled jobs

Five jobs keep a live provider catalogue current, stop expired holds from
selling a slot twice, tell a customer their balance is coming due, and deliver the
mail checkout wrote down instead of sending. None of them run on the `server`
service itself: that service answers requests, and a catalogue walk takes hours.

| Job               | Cadence          | Runs                                     | Config                                       |
| ----------------- | ---------------- | ---------------------------------------- | -------------------------------------------- |
| Catalogue sync    | daily, 01:00 UTC | `pnpm --filter server sync:catalogue`    | `apps/server/railway.cron-catalogue.json`    |
| Availability sync | hourly           | `pnpm --filter server sync:availability` | `apps/server/railway.cron-availability.json` |
| Expiry sweep      | every 10 min     | `pnpm --filter server sweep:expiries`    | `apps/server/railway.cron-sweep.json`        |
| Payment reminders | daily, 09:00 UTC | `pnpm --filter server remind:payments`   | `apps/server/railway.cron-reminders.json`    |
| Outbox drain      | every 5 min      | `pnpm --filter server drain:outbox`      | `apps/server/railway.cron-outbox.json`       |

`0 1 * * *` is 02:00 CET in winter and 03:00 CEST in summer, both of which clear
the NauSYS request for one full dump a day after 01:00 GMT+1. Railway's cron
runs in UTC and enforces a minimum gap between runs (5 minutes at the time of
writing), so the sweep can go faster than 10 minutes but not much.

The outbox drain is the only job here that is not the primary path for its own work.
Guest checkout writes its set-password invitation and its booking confirmation to
`outbox_message` and starts a drain in-process as soon as it has an answer to return,
so in a healthy system the mail is already gone and this tick finds nothing. It runs
at Railway's minimum gap because what it catches is a container replaced mid-drain
and a mailer that was down — the cases where the customer is waiting on this run and
nothing else. See `packages/api/src/services/outbox.ts`.

The reminder window is ten days wide and each installment is claimed before it is
mailed, so the daily tick is a floor rather than a deadline: a missed day catches
the same booking tomorrow, and an extra run the same day sends nothing. 09:00 UTC
puts it in the customer's morning across Europe rather than overnight.

## The five cron services

Each is a Railway service in the same project, built from this repo, and all
five are created the same way. Add the service in the dashboard, then point its
config-as-code path at its file above. Railway cannot create a service from a
committed file, so that part is manual; everything else about the deployment is
in the file.

The long-running server service is called `api` in Railway, though its workspace
is `apps/server`; the variable references below name the service, not the folder.

Four differences from `apps/server/railway.json`, all deliberate:

- **No `preDeployCommand`.** Migrations belong to the `server` service alone.
  Several services racing `drizzle-kit migrate` at deploy time is a way to
  corrupt the ledger, not a way to be safe.
- **No healthcheck.** These processes never open a port, so a healthcheck would
  fail every run.
- **`restartPolicyType: NEVER`.** A cron process that finishes has succeeded.
  `ON_FAILURE` would read the exit as a crash and restart the sync in a loop.
- **`multiRegionConfig: { "europe-west4-drams3a": ... }`** (EU West), pinned
  rather than left to the platform default so a sync never runs an ocean away
  from the Postgres it writes row by row. `api` and the database are already
  there. It has to be `multiRegionConfig` and not the flat `deploy.region`:
  both are in Railway's schema, but the dashboard's Regions & Replicas control
  reads the former, and a file setting only `region` leaves the service in the
  default US West while still showing as file-managed. Replicas are not
  available for cron services at all, so the nested `numReplicas` is only there
  because the shape requires it.

The three sync and sweep services also watch `packages/providers/**`, which the
`server` service does not: the provider adapters are what they actually run.
`cron-reminders` and `cron-outbox` watch `packages/transactional/**` instead, for
the same reason and with the same consequence if it is missing: an edit to a mail
template alone would otherwise leave the service running the previous build.

Each entry point ends with `await db.$client.end()`, and that line is what makes
a scheduled run possible at all. An idle pool client keeps the event loop open,
so without it the container runs the job, prints its summary and then sits there
forever. Railway reads that as a run still in progress and skips every tick
behind it, which looks like a cron that fired once and died. Any future entry
point on this schedule needs the same closing line.

All four import `@yacht-charter/env/server`, which validates the whole
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

`cron-sweep` needs neither `PROVIDER_AUTO_PUBLISH` nor `REVALIDATE_SECRET`: it
publishes nothing and writes no catalog, so there is no cache to drop. It does
need the NauSYS pair like the other two, and not only to satisfy the env schema.
`inventoryProvider` is built from `PROVIDER_MODE` at import, so nausys mode
without credentials throws before the sweep starts, and releasing a hold is a
real call to the vendor.

`cron-reminders` and `cron-outbox` touch no provider at all, so `PROVIDER_MODE` can
stay at its `mock` default there. What they do need is the mailer, and need it more
than anything else on this page needs its optional variables:

```
RESEND_API_KEY         ${{api.RESEND_API_KEY}}
EMAIL_FROM             ${{api.EMAIL_FROM}}
EMAIL_FROM_NAME        ${{api.EMAIL_FROM_NAME}}
REPLY_TO_EMAIL         ${{api.REPLY_TO_EMAIL}}
```

`RESEND_API_KEY` and `EMAIL_FROM` are optional in the schema, and a send without
them is skipped rather than failed. That is right for a checkout that must not be
undone by a mailer outage and wrong here: `reminder_sent_at` is claimed before the
send, so an unconfigured service would mark every due installment reminded and mail
nobody, once, unrecoverably. `payment-reminders.ts` therefore checks the pair itself
and exits non-zero before it reads a row. `drain-outbox.ts` checks it for the same
reason: a skipped send is indistinguishable from a delivery to the drain, so an
unconfigured service would mark every pending message sent and mail nobody. The other two are cosmetic and follow the
`api` service only so a customer sees the same sender on every mail.

Reference the `api` service rather than pasting values, so a rotated credential
reaches all five services at once. `CRON_SECRET` is not needed anywhere here:
these run the job directly rather than calling the HTTP route, so there is no
request to authenticate.

## The HTTP routes are still there

`/api/cron/sweep-expiries`, `/api/cron/sync-catalogue`,
`/api/cron/sync-availability`, `/api/cron/payment-reminders` and
`/api/cron/drain-outbox` are unchanged and still guarded by `CRON_SECRET`. They
are the manual escape hatch: clearing a stuck hold, kicking a sync, or pushing the
mail out after a mailer outage, without waiting for the next tick. Nothing
schedules them.

Prefer the services above for anything scheduled. The two sync routes start the
job and return the run ids immediately, because a full walk outlives any platform
request timeout, so a 200 from them says only that the job was accepted. The
entry points await the job instead, which is why their exit code and logs mean
something.

`sweep-expiries.ts`, `payment-reminders.ts` and `drain-outbox.ts` go one step
further and exit non-zero on the failures that would otherwise pass unseen, so a red
run in Railway is the signal.

For the sweep that is a failed provider release. Our side of that booking expired
either way; the vendor is still holding the option. Stale confirmations do not fail
the run, since `expiry.ts` reports rather than moves them precisely because guessing
either way is wrong.

For the reminders it is a missing `RESEND_API_KEY` or `EMAIL_FROM`, checked before
the first row is read. A skipped send elsewhere in the app is recoverable; here the
row that would have been retried has already been claimed.

For the drain it is that same pair, and a message that ran out of attempts. Six
claims is where the outbox stops trying, and what is left is a set-password
invitation or a booking confirmation nobody will ever send — `last_error` on the row
says why.

## What a green run does and does not mean

Progress and failures land in `sync_run` and `sync_error` either way. Poll
`admin.provider.syncStatus` to follow a run.

Overlap is safe. A provider with a run already in flight is reported as not
started rather than failing, and the NauSYS queue serializes every call on one
credential, so an hourly availability run colliding with a still-running nightly
catalogue walk just skips that hour.
