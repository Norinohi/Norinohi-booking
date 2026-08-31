import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// config.ts reads the server env at import time for its default parameter.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { FetchLike } from "../shared/http-client";
import { SequentialQueue } from "../shared/queue";
import { BookingManagerClient } from "./client";
import { bookingManagerEndpoints } from "./endpoints";
import { type BookingManagerEnvSource, resolveBookingManagerConfig } from "./config";

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
    queue: new SequentialQueue(),
    fetchImpl,
    retry: { maxAttempts: 4, sleep: async () => {} },
  });
}

/*
 * A quote's budget in offer-selection.ts covers the wait on this queue as well as the vendor's
 * own work, so a customer call sharing one lane with every other customer times out under
 * ordinary traffic and is reported to them as a week that cannot be priced.
 */
describe("BookingManagerClient live lanes", () => {
  const client = clientWith(async () => new Response("[]", { status: 200 }));

  it("keeps a customer call off the lane the sweeps share", () => {
    expect(client.liveLane().queueKey).not.toBe(client.sweepLane("offers", 0).queueKey);
  });

  it("spreads consecutive customer calls across lanes rather than queueing them", () => {
    const lanes = new Set(Array.from({ length: 4 }, () => client.liveLane().queueKey));

    expect(lanes.size).toBe(4);
  });

  it("keeps a ceiling on how many run at once, since this vendor has not exempted them", () => {
    const lanes = new Set(Array.from({ length: 40 }, () => client.liveLane().queueKey));

    expect(lanes.size).toBe(4);
  });
});

describe("BookingManagerClient retries", () => {
  it("does not replay POST /requests, which files a vendor-side request", async () => {
    let attempts = 0;
    const client = clientWith(async () => {
      attempts += 1;
      throw new Error("fetch failed");
    });

    await expect(
      client.post(bookingManagerEndpoints.requests, z.unknown(), {
        objectId: 1,
        type: 1,
        parameters: {},
      }),
    ).rejects.toThrow();

    expect(attempts).toBe(1);
  });

  it("still retries an ordinary POST", async () => {
    let attempts = 0;
    const client = clientWith(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("fetch failed");
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await client.post(bookingManagerEndpoints.reservation, z.unknown(), {});

    expect(attempts).toBe(3);
  });
});
