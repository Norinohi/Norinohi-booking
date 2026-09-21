import { describe, expect, it, vi } from "vitest";

// config.ts reads the server env at import time for its default parameter.
// Hoisted so it lands before that module evaluation; every test passes a source.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { AuthError } from "../shared/errors";
import {
  BM_LIVE_LANES,
  BM_MAX_CONCURRENT_CALLS,
  BM_MAX_PRICE_WEEKS_CONCURRENCY,
  BM_MAX_SWEEP_CONCURRENCY,
  BM_SHARED_LANE_CALLERS,
} from "./call-budget";
import {
  type BookingManagerEnvSource,
  bookingManagerQueueKey,
  resolveBookingManagerConfig,
} from "./config";
import { BM_SERVER_COUNT } from "./warmup";

const source: BookingManagerEnvSource = {
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_SYNC_TIMEOUT_MS: 180_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 250,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 6,
  BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 4,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
};

describe("resolveBookingManagerConfig", () => {
  it("refuses a sweep concurrency that could trip the vendor's 20-call ceiling", () => {
    expect(() =>
      resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_SWEEP_CONCURRENCY: 13 }),
    ).toThrow(/SWEEP_CONCURRENCY/);
  });

  it("allows the sweep right up to its share of the ceiling", () => {
    expect(
      resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_SWEEP_CONCURRENCY: 12 }),
    ).toMatchObject({ sweepConcurrency: 12 });
  });

  it("refuses a price-weeks fan-out above the nightly pass's own ceiling", () => {
    expect(() =>
      resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 9 }),
    ).toThrow(/PRICE_WEEKS_CONCURRENCY/);
  });

  it("reads the env slice", () => {
    expect(resolveBookingManagerConfig(source)).toMatchObject({
      baseUrl: "https://www.booking-manager.com/api/v2",
      apiToken: "t0ken",
      timeoutMs: 30_000,
      minIntervalMs: 250,
      optionSafetyMarginMinutes: 15,
      timeZone: "Europe/Zagreb",
    });
  });

  it("strips a trailing slash so joined paths do not double up", () => {
    expect(
      resolveBookingManagerConfig({
        ...source,
        BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2//",
      }).baseUrl,
    ).toBe("https://www.booking-manager.com/api/v2");
  });

  it.each([undefined, "", "   "])("refuses loudly when the token is %o", (token) => {
    // The env schema keeps the token optional so a missing secret cannot stop the
    // server booting, which makes this the only place that can refuse.
    expect(() =>
      resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_API_KEY: token }),
    ).toThrow(AuthError);
  });
});

/*
 * Every guard is per process and the vendor's limit is per account, so the only thing keeping
 * the worst moment under it is this arithmetic: one sweep at its widest, the server's live lanes,
 * and every single-lane caller, all at once.
 */
describe("the account-wide call budget", () => {
  it("fits a full-width sweep beside every live and background caller", () => {
    expect(BM_MAX_SWEEP_CONCURRENCY + BM_LIVE_LANES + BM_SHARED_LANE_CALLERS).toBeLessThanOrEqual(
      BM_MAX_CONCURRENT_CALLS,
    );
  });

  it("keeps the price-weeks pass and the cold-start warm-up inside the sweep's share", () => {
    expect(BM_MAX_PRICE_WEEKS_CONCURRENCY).toBeLessThanOrEqual(BM_MAX_SWEEP_CONCURRENCY);
    expect(BM_SERVER_COUNT).toBeLessThanOrEqual(BM_MAX_SWEEP_CONCURRENCY);
  });
});

describe("company scope", () => {
  const scopeOf = (raw: string | undefined) =>
    resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_COMPANY_IDS: raw }).companyScope
      .include;

  it("reads a comma separated list", () => {
    expect(scopeOf("225,331")).toEqual(["225", "331"]);
  });

  it("tolerates spacing and trailing separators", () => {
    expect(scopeOf(" 225 , 331 ,")).toEqual(["225", "331"]);
  });

  it.each([undefined, "", "  ", ","])("imports every company for %o", (raw) => {
    // Empty is production's intent, so it must never be mistaken for "import
    // nothing": a scope that silently matched no company would empty the catalogue.
    expect(scopeOf(raw)).toEqual([]);
  });
});

describe("bookingManagerQueueKey", () => {
  it("never embeds the token, which would leak it into logs and error context", () => {
    const key = bookingManagerQueueKey("super-secret-token");
    expect(key).not.toContain("super-secret-token");
    expect(key).toMatch(/^booking_manager:[0-9a-f]{16}$/);
  });

  it("is stable per token and distinct across credentials", () => {
    expect(bookingManagerQueueKey("a")).toBe(bookingManagerQueueKey("a"));
    expect(bookingManagerQueueKey("a")).not.toBe(bookingManagerQueueKey("b"));
  });
});
