import { describe, expect, it, vi } from "vitest";

// config.ts reads the server env at import time for its default parameter.
// Hoisted so it lands before that module evaluation; every test passes a source.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { AuthError } from "../shared/errors";
import {
  type BookingManagerEnvSource,
  bookingManagerQueueKey,
  resolveBookingManagerConfig,
} from "./config";

const source: BookingManagerEnvSource = {
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_TOKEN: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 250,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
};

describe("resolveBookingManagerConfig", () => {
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
      resolveBookingManagerConfig({ ...source, BOOKING_MANAGER_API_TOKEN: token }),
    ).toThrow(AuthError);
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
