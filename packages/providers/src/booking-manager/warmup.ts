import { z } from "zod";

import type { SyncReporter } from "../sync/runner";
import type { BookingManagerClient } from "./client";
import { bookingManagerEndpoints } from "./endpoints";

/**
 * The vendor serves the REST API from six servers and pays a one-off "cold start"
 * on the first call each of them handles. It is undocumented and was confirmed in
 * writing on 2026-08-25 (Diego Pacifico, MMK) after we measured a 29.7 s `/offers`
 * call against a median near 1 s, with the slow calls clustered at the start of a
 * run and gone by the next one.
 *
 * Their servers restart nightly, so every one of them is cold when the catalogue
 * sweep starts.
 */
export const BM_SERVER_COUNT = 6;

/**
 * Twice the server count, because we cannot address a server directly and the
 * load balancer gives no affinity we can steer. Firing n calls at 6 servers that
 * are picked independently leaves each one cold with probability (5/6)^n: 33% at
 * n=6, 11% at n=12, 4% at n=18. Twelve buys most of the benefit; the rest is a
 * long tail we would be paying full sweep concurrency for.
 *
 * The one call that stays cold costs the sweep a slow read it would have paid
 * anyway, so this is a best-effort improvement and never a precondition.
 */
export const BM_WARMUP_CALLS = BM_SERVER_COUNT * 2;

/**
 * 302 bytes on 2026-08-25, the smallest response the API has, and an endpoint the
 * catalogue already reads - so a warm-up asks for nothing we are not entitled to.
 */
const WARMUP_ENDPOINT = bookingManagerEndpoints.yachtTypes;

const warmupSchema = z.unknown();

/**
 * A warm-up slower than this means the cold starts were real and this run very
 * likely did not absorb all of them, which is the only case worth a log line: a
 * quiet warm-up is indistinguishable from a warm server and needs no comment.
 */
export const BM_COLD_START_NOTICE_MS = 10_000;

export interface BookingManagerWarmupResult {
  /** Calls that answered, whatever they answered with. */
  warmed: number;
  attempted: number;
  slowestMs: number;
}

/**
 * Fires `BM_WARMUP_CALLS` cheap reads concurrently so the cold starts land here
 * rather than inside the sweep.
 *
 * Each call takes a lane of its own. On the client's single shared lane they
 * would run one at a time, and a sequential ping is worthless: the first would
 * warm one server and the remaining eleven would most likely be served by it
 * again, having warmed nothing.
 *
 * Never throws. A failed warm-up means the sweep pays the cold starts itself,
 * which is exactly what it did before this existed.
 */
export async function warmBookingManagerServers(
  client: BookingManagerClient,
  reporter?: Pick<SyncReporter, "reportError">,
): Promise<BookingManagerWarmupResult> {
  const startedAt = Date.now();
  const timings: number[] = [];

  const results = await Promise.allSettled(
    Array.from({ length: BM_WARMUP_CALLS }, async (_unused, slot) => {
      const callStartedAt = Date.now();
      await client.get(WARMUP_ENDPOINT, warmupSchema, undefined, client.sweepLane("warmup", slot));
      timings.push(Date.now() - callStartedAt);
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length === results.length && failures[0]?.status === "rejected") {
    // Every call failing is worth a line - it means the credential or the host is
    // in trouble, and the sweep is about to find that out the expensive way.
    await reporter?.reportError(failures[0].reason, {
      resourceType: "category",
      context: { endpoint: WARMUP_ENDPOINT, attempted: results.length },
    });
  }

  return {
    warmed: results.length - failures.length,
    attempted: results.length,
    slowestMs: timings.length > 0 ? Math.max(...timings) : Date.now() - startedAt,
  };
}
