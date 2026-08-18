import { createHash } from "node:crypto";

import { env } from "@yacht-charter/env/server";

import { AuthError } from "../shared/errors";

export interface BookingManagerConfig {
  baseUrl: string;
  apiToken: string;
  timeoutMs: number;
  minIntervalMs: number;
  /** `holdExpiresAt = expirationDate − this`, so our sweeper releases first. */
  optionSafetyMarginMinutes: number;
  /**
   * Zone the vendor's naked wall-clock datetimes are read in. MMK support
   * confirmed (Aug 2026) they are a fixed CET clock that observes daylight
   * saving, so this must stay a real IANA zone in that offset family; a fixed
   * "+01:00" would be an hour wrong all summer.
   *
   * It does NOT apply to base check-in and check-out times. Those are the base's
   * own local times - the vendor substitutes them into `/offers` responses - so
   * they stay plain wall-clock strings and are never converted.
   */
  timeZone: string;
  /** Serialization key. One lane per credential, never per instance. */
  queueKey: string;
}

/** The slice of the server env this adapter reads. */
export interface BookingManagerEnvSource {
  BOOKING_MANAGER_BASE_URL: string;
  BOOKING_MANAGER_API_KEY?: string | undefined;
  BOOKING_MANAGER_TIMEOUT_MS: number;
  BOOKING_MANAGER_MIN_INTERVAL_MS: number;
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: number;
  BOOKING_MANAGER_TIMEZONE: string;
}

/**
 * Keyed on a fingerprint rather than the token: the queue key reaches logs and
 * error context, and a bearer token there is a leaked credential.
 */
export function bookingManagerQueueKey(apiToken: string): string {
  return `booking_manager:${createHash("sha256").update(apiToken).digest("hex").slice(0, 16)}`;
}

/**
 * The token is optional in the env schema so a missing secret cannot stop the
 * server booting. The cost is that this is the point where booking_manager mode
 * has to refuse loudly rather than issue unauthenticated calls.
 */
export function resolveBookingManagerConfig(
  source: BookingManagerEnvSource = env,
): BookingManagerConfig {
  const apiToken = source.BOOKING_MANAGER_API_KEY?.trim();

  if (!apiToken) {
    throw new AuthError(
      "Booking Manager credentials are not configured: set BOOKING_MANAGER_API_KEY",
      { providerCode: "MISSING_CREDENTIALS" },
    );
  }

  return {
    baseUrl: source.BOOKING_MANAGER_BASE_URL.replace(/\/+$/, ""),
    apiToken,
    timeoutMs: source.BOOKING_MANAGER_TIMEOUT_MS,
    minIntervalMs: source.BOOKING_MANAGER_MIN_INTERVAL_MS,
    optionSafetyMarginMinutes: source.BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES,
    timeZone: source.BOOKING_MANAGER_TIMEZONE,
    queueKey: bookingManagerQueueKey(apiToken),
  };
}
