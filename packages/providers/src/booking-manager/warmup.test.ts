import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { FetchLike } from "../shared/http-client";
import { queueForInterval } from "../shared/queue";
import { BookingManagerClient } from "./client";
import { type BookingManagerEnvSource, resolveBookingManagerConfig } from "./config";
import { BM_WARMUP_CALLS, warmBookingManagerServers } from "./warmup";

const source: BookingManagerEnvSource = {
  BOOKING_MANAGER_BASE_URL: "https://provider.test",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 6,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
};

function clientWith(fetchImpl: FetchLike) {
  return new BookingManagerClient({
    config: resolveBookingManagerConfig(source),
    // The real client's queue, not a sequential stub: whether the pings overlap
    // is the whole point of the warm-up and has to be exercised for real.
    queue: queueForInterval(0),
    retry: { maxAttempts: 1 },
    fetchImpl,
  });
}

const ok = () =>
  Promise.resolve({
    status: 200,
    text: () => Promise.resolve("[]"),
  });

describe("warmBookingManagerServers", () => {
  it("fires its calls concurrently, so they can land on different servers", async () => {
    let inFlight = 0;
    let peak = 0;
    const client = clientWith(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return ok();
    });

    const result = await warmBookingManagerServers(client);

    expect(result).toMatchObject({ warmed: BM_WARMUP_CALLS, attempted: BM_WARMUP_CALLS });
    // A serial warm-up would peak at 1 and warm a single server twelve times over.
    expect(peak).toBe(BM_WARMUP_CALLS);
  });

  it("reports a total failure rather than throwing into the sweep", async () => {
    const reported: unknown[] = [];
    const client = clientWith(() => Promise.reject(new Error("fetch failed")));

    const result = await warmBookingManagerServers(client, {
      reportError: (error) => {
        reported.push(error);
        return Promise.resolve();
      },
    });

    expect(result.warmed).toBe(0);
    expect(reported).toHaveLength(1);
  });

  it("stays quiet when only some calls fail, because the sweep is unaffected", async () => {
    const reported: unknown[] = [];
    let calls = 0;
    const client = clientWith(() => {
      calls += 1;
      return calls % 2 === 0 ? Promise.reject(new Error("fetch failed")) : ok();
    });

    const result = await warmBookingManagerServers(client, {
      reportError: (error) => {
        reported.push(error);
        return Promise.resolve();
      },
    });

    expect(result.warmed).toBe(BM_WARMUP_CALLS / 2);
    expect(reported).toHaveLength(0);
  });
});
