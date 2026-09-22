import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// config.ts reads the server env at import time for its default parameter.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { FetchLike } from "../shared/http-client";
import { SequentialQueue } from "../shared/queue";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { providerRejection } from "../testing/contracts";
import { BookingManagerClient } from "./client";
import { BM_RESERVATION_REFUSAL, bookingManagerEndpoints } from "./endpoints";
import { type BookingManagerEnvSource, resolveBookingManagerConfig } from "./config";

const source: BookingManagerEnvSource = {
  BOOKING_MANAGER_BASE_URL: "https://provider.test",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_SYNC_TIMEOUT_MS: 180_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 6,
  BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 4,
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

/*
 * One `/offers` answers for the whole account for a week and one `/yachts` page for a
 * whole company, so the sweep's calls are slow by nature; the live ceiling next to them
 * governs a quote a guest is waiting on and has to stay short.
 */
describe("BookingManagerClient lane timeouts", () => {
  const client = clientWith(async () => new Response("[]", { status: 200 }));

  it("gives a sweep read the long ceiling", () => {
    expect(client.sweepLane("offers", 0).timeoutMs).toBe(180_000);
  });

  it("leaves a customer call on the client's own short one", () => {
    expect(client.liveLane().timeoutMs).toBeUndefined();
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

  it("does not replay POST /reservation, which would open a second booking", async () => {
    let attempts = 0;
    const client = clientWith(async () => {
      attempts += 1;
      throw new Error("fetch failed");
    });

    await expect(
      client.post(bookingManagerEndpoints.reservation, z.unknown(), {}),
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

    await client.post(bookingManagerEndpoints.offers, z.unknown(), {});

    expect(attempts).toBe(3);
  });
});

/*
 * POST /reservation refuses in plain text, which the JSON parse cannot hold, and the text is
 * the only thing that tells a slot taken by someone else from our own option already on it.
 * The bodies are company 225's answers on 2026-09-22.
 */
describe("BookingManagerClient reservation refusals", () => {
  const refusing = (status: number, text: string) =>
    clientWith(async () => new Response(text, { status }));
  const post = (client: BookingManagerClient) =>
    providerRejection(client.post(bookingManagerEndpoints.reservation, z.unknown(), {}));

  it.each([
    ["Yacht is not available, own Option exists.", BM_RESERVATION_REFUSAL.OWN_OPTION_EXISTS],
    ["Yacht is not available, price not defined.", BM_RESERVATION_REFUSAL.PRICE_NOT_DEFINED],
    ["Yacht is not available.", BM_RESERVATION_REFUSAL.NOT_AVAILABLE],
  ])("reads %j as the charter being unavailable", async (text, code) => {
    const error = await post(refusing(400, text));

    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(error.providerCode).toBe(code);
    expect(error.message).toContain(text);
  });

  it("keeps any other 400 a contract failure, with the vendor's sentence on it", async () => {
    const error = await post(refusing(400, "Error creating entity."));

    expect(error).toBeInstanceOf(ContractError);
    expect(error.message).toBe("Provider returned HTTP 400: Error creating entity.");
  });

  it("reads the same sentence elsewhere as nothing special", async () => {
    const client = refusing(400, "Yacht is not available, own Option exists.");

    const error = await providerRejection(
      client.put(bookingManagerEndpoints.reservationById("1"), z.unknown()),
    );

    expect(error).toBeInstanceOf(ContractError);
  });
});
