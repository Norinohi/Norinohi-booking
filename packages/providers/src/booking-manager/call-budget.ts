/*
 * Apart from `config.ts` because that module reads the server env at import time, and the client
 * needs its lane count without dragging env validation into every test that builds one.
 */

/**
 * The vendor allows 20 API calls in flight at once across the whole account.
 * Exceeding it is not throttled: the account "may be blocked until the servers
 * are restarted", which currently happens overnight, so one bad deploy costs a
 * day of catalogue and live quotes alike (Diego Pacifico, MMK, 2026-08-25).
 */
export const BM_MAX_CONCURRENT_CALLS = 20;

/**
 * Customer calls one server process keeps in flight; see `liveLane`. Four is the sweep's own
 * default fan-out, so it is a load the vendor already sees from us.
 */
export const BM_LIVE_LANES = 4;

/**
 * Callers that each hold at most one call open beside a sweep, because each goes through its
 * process's single shared lane: the server's (holds, bookings, confirmations, releases), the
 * sweeping process's own (dumps, occupancy), and the reconcile and expiry crons, which open no
 * sync run and so are not held off by one.
 */
export const BM_SHARED_LANE_CALLERS = 4;

/**
 * What is left for a sweep once everything that may run beside it has its share.
 *
 * The limit is per account while every guard we have is per process, so this is a budget
 * across processes and it holds only on three conditions:
 * - one sweep at a time. Booking Manager is in `EXCLUSIVE_PROVIDER_CODES` (`sync/run.ts`), so a
 *   catalogue walk, an availability run and the price-weeks pass never overlap, and inside a
 *   run the `/yachts`, `/prices` and `/offers` fan-outs follow one another;
 * - one server replica. Each extra replica brings its own live lanes and shared lane;
 * - one deployment per key. A staging environment on the production key doubles everything.
 *
 * Break one and this number has to come down with it.
 */
export const BM_MAX_SWEEP_CONCURRENCY =
  BM_MAX_CONCURRENT_CALLS - BM_LIVE_LANES - BM_SHARED_LANE_CALLERS;

/**
 * The price-weeks pass is a sweep like the others and fits under the same budget. Its own lower
 * ceiling is because it is write-bound: measured on 2026-09-18, widths 1 and 4 took the same wall
 * clock, so a wider setting would only spend the account's headroom.
 */
export const BM_MAX_PRICE_WEEKS_CONCURRENCY = 8;
