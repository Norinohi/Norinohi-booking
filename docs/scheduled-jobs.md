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

Seasonal prices are written by the **catalogue** run, not the availability one.
They used to be part of the hourly sweep, because that is where they were needed:
a free period reads better with a price on it. But a price list is catalogue data
that a vendor publishes for a season and leaves alone, and the volume is not small
— Booking Manager's sweep is 52 weeks per yacht per year, so on a real fleet the
hourly run was rewriting on the order of a million `listing_price_period` rows to
restate figures that had not moved since the night before. They are now phase C of
the daily import, after the listings are written and for the listings that run
refreshed. A vendor price endpoint failing there is reported and downgrades the run
to `partial`; it does not fail the import, and the previous day's prices stand.
See `packages/providers/src/sync/price-writer.ts`.

**Reference exchange rates** are refreshed at the top of the same catalogue run, before any
provider walk, because the projection each provider rebuilds at the end of its run converts
prices with them. They are never charged against: `listing_search_doc.price_from_minor_eur` is
written from them so the price sort, the price filter and the "from" aggregates can compare
listings that vendors publish in different currencies, while the card keeps showing the published
price. The source is the ECB daily reference feed, which is free, keyless and EUR-based.

The fetch is deliberately non-fatal — a public feed being down must not cost the night's import.
With no rate fresher than `MAX_RATE_AGE_DAYS` (7, in `packages/db/src/fx/rates.ts`), listings in
that currency drop out of those comparisons instead of being compared wrongly. The run's job event
carries `fxAsOf`, which is the field to alert on: a feed that answers every night with the same
date is the failure a success flag cannot show. `pnpm --filter server refresh:fx` is the by-hand
path, for seeding a fresh database or catching up after a stretch with no sync; it stores rates
only, so pair it with `rebuild:search-docs` when the fleet needs repricing.

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

## A deploy must not strand the sync lock

`sync_run_in_flight_uq` allows one `pending`/`running` row per provider and kind, and only
the working process writes a terminal status. So a redeploy, an OOM or a hard restart used
to leave the row behind, holding the lock against every later tick — the daily catalogue
sync would be refused at the insert, quietly, until a sweep six hours later noticed.

Three things now give that lock a lease. They are layered on purpose: each one covers a
failure the one before it cannot.

- **A heartbeat.** `sync_run.heartbeat_at` is touched once a minute by the owning process
  (`packages/providers/src/sync/run.ts`). The reaper reads that instead of `started_at`, so
  its cutoff measures liveness rather than duration and can be `STALE_SYNC_RUN_MS` — ten
  minutes — without ever reaping a multi-hour walk that is still working. The timer is
  `unref`'d, so it can never be the reason a container fails to exit.
- **A shutdown hook.** SIGTERM and SIGINT close every run the process still owns as `failed`,
  with a `sync_error` naming the signal, then exit `128 + signum`. A deploy is the common way
  a run dies and the one case where the process is told first, so this releases the lock in
  the same second rather than ten minutes later. Best effort inside a five-second budget: a
  database that will not answer must not also cost us the exit.
- **Reaping at the lock.** `openSyncRun` does not believe a conflict. If the incumbent stopped
  beating it is failed and the insert retried once, so the next scheduled tick unblocks itself
  instead of waiting for the sweep. The sweep still runs the same `reapStaleSyncRuns`, for the
  provider whose schedule has nothing due and whose stranded row nobody is asking about.

Two consequences worth knowing. A collision that survives all of this means a live run really
is walking that provider, so the sync entry points count it apart from a failure and exit `0`
— a previous tick overrunning is ordinary, and exiting non-zero reported the container as
Crashed for doing the right thing. And the migration that added `heartbeat_at` backfilled
every existing row with the migration's own timestamp, so a sync still running from an older
build loses its lock ten minutes into the deploy; it is being SIGTERM'd by that same deploy
anyway.

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

Then what the jobs actually use.

`cron-catalogue` and `cron-availability` fan out over **every enabled provider**,
not the one `PROVIDER_MODE` names - they build from `createEnabledInventoryProviders`,
and a provider whose credentials are absent is skipped silently. That is the trap:
give these two only one vendor's credentials and the other vendor simply never
syncs, with no error anywhere. Both need both sets.

```
PROVIDER_MODE=nausys
NAUSYS_BASE_URL                      ${{api.NAUSYS_BASE_URL}}
NAUSYS_USERNAME                      ${{api.NAUSYS_USERNAME}}
NAUSYS_PASSWORD                      ${{api.NAUSYS_PASSWORD}}
NAUSYS_COMPANY_IDS                   ${{api.NAUSYS_COMPANY_IDS}}
NAUSYS_EXCLUDED_COMPANY_IDS          ${{api.NAUSYS_EXCLUDED_COMPANY_IDS}}
BOOKING_MANAGER_BASE_URL             ${{api.BOOKING_MANAGER_BASE_URL}}
BOOKING_MANAGER_API_KEY              ${{api.BOOKING_MANAGER_API_KEY}}
BOOKING_MANAGER_COMPANY_IDS          ${{api.BOOKING_MANAGER_COMPANY_IDS}}
BOOKING_MANAGER_EXCLUDED_COMPANY_IDS ${{api.BOOKING_MANAGER_EXCLUDED_COMPANY_IDS}}
PROVIDER_AUTO_PUBLISH=nausys
REVALIDATE_SECRET                    ${{api.REVALIDATE_SECRET}}
```

`PROVIDER_MODE` is still single-valued and still matters, but only to the booking
path: an offer has one source and checkout must not have to choose. Importing from
two vendors and selling through one are different questions, and this variable
answers the second.

`PROVIDER_AUTO_PUBLISH` is a comma-separated list, and it is deliberately **not**
`nausys,booking_manager` here. Adding a provider to it puts every yacht it imports
straight on sale; for Booking Manager that is a five-figure fleet nobody has looked
at. New Booking Manager listings land as drafts and are released from the admin
Listings screen instead.

The company scope pair is what keeps a vendor's test companies out. Unset imports
everything the credential sees; the exclusion list wins over the allowlist and is
what production sets. Narrowing the scope also retires what a wider run imported -
the next catalogue run deactivates those records and their listings are hidden.
`apps/server/.env.example` carries the full explanation.

`cron-sweep` needs neither `PROVIDER_AUTO_PUBLISH` nor `REVALIDATE_SECRET`: it
publishes nothing and writes no catalog, so there is no cache to drop. Credentials
it does need, for two separate reasons.

The first is module scope, unchanged: `inventoryProvider` is built from
`PROVIDER_MODE` when `@yacht-charter/api/context` is imported, so nausys mode
without the pair throws before the sweep starts.

The second is newer and easier to get wrong. Releasing a hold is a real call to the
vendor that issued it, and the sweep walks every booking regardless of provider, so
it resolves the adapter from each booking's own `provider` column rather than using
the configured one - releasing a Booking Manager option through the NauSYS adapter
would hand the wrong vendor an id it never issued. **So this service needs the
credentials of every vendor that can hold an option, not just the one
`PROVIDER_MODE` names.** Give it only the NauSYS pair and an expiring Booking
Manager hold is refused rather than released: the run exits non-zero and the vendor
keeps holding the boat, which is at least loud, but it is still a boat nobody can
sell until someone reads the log.

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

A red run is only a signal to whoever looks, though, and nobody looks at 03:00. So all
five entry points call `startJob(name)` from `apps/server/src/job.ts` before they do
anything and emit one wide event when they end — `action: job.<name>`, an outcome, the
run's duration and its own counters — through the same Sentry drain the servers
use (see the repo `AGENTS.md`). That event is what an alert fires on. It costs nothing
until `SENTRY_DSN` is set, and it does not replace the console
output, which is still what an operator running one of these by hand reads.

`startJob` also installs `unhandledRejection` and `uncaughtException` handlers, so a job
that throws past its top-level await reports before it dies — the failure most worth
hearing about, and the one no explicit call site can cover. It prints the stack first,
because taking over from Node's default handler would otherwise swallow it.

The by-hand scripts (`seed-facets.ts`, `publish-listings.ts`, `repair-bm-ids.ts`,
`rebuild-search-docs.ts`) deliberately skip all of this: somebody is watching the
terminal, which is the whole reason the event exists for the other five.

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
