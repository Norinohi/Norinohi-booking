import { createHash } from "node:crypto";

import { env } from "@yacht-charter/env/server";

import { type CompanyScope, companyScopeFromEnv } from "../shared/company-scope";
import { AuthError, ContractError } from "../shared/errors";

export interface BookingManagerConfig {
  baseUrl: string;
  apiToken: string;
  timeoutMs: number;
  minIntervalMs: number;
  /** Reads the catalogue and price sweeps keep in flight; see the env note. */
  sweepConcurrency: number;
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
  /** Which charter companies to import. Unconfigured means every company the key can see. */
  companyScope: CompanyScope;
  /** Serialization key. One lane per credential, never per instance. */
  queueKey: string;
}

/** The slice of the server env this adapter reads. */
export interface BookingManagerEnvSource {
  BOOKING_MANAGER_BASE_URL: string;
  BOOKING_MANAGER_API_KEY?: string | undefined;
  BOOKING_MANAGER_COMPANY_IDS?: string | undefined;
  BOOKING_MANAGER_EXCLUDED_COMPANY_IDS?: string | undefined;
  BOOKING_MANAGER_TIMEOUT_MS: number;
  BOOKING_MANAGER_MIN_INTERVAL_MS: number;
  BOOKING_MANAGER_SWEEP_CONCURRENCY: number;
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: number;
  BOOKING_MANAGER_TIMEZONE: string;
}

/**
 * The vendor allows 20 API calls in flight at once across the whole account.
 * Exceeding it is not throttled: the account "may be blocked until the servers
 * are restarted", which currently happens overnight, so one bad deploy costs a
 * day of catalogue and live quotes alike (Diego Pacifico, MMK, 2026-08-25).
 */
export const BM_MAX_CONCURRENT_CALLS = 20;

/**
 * The sweep is capped below that ceiling because it is not the only caller: live
 * quotes run on the same credential while a nightly sync is in flight, and they
 * are the traffic that must not be the one to trip the limit. Four slots is the
 * reserve; the sweep may have the rest.
 */
export const BM_LIVE_TRAFFIC_RESERVE = 4;
export const BM_MAX_SWEEP_CONCURRENCY = BM_MAX_CONCURRENT_CALLS - BM_LIVE_TRAFFIC_RESERVE;

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

  // Refused rather than clamped. Silently running a sweep narrower than asked for
  // would hide the misconfiguration until someone wonders why the sync is slow,
  // and the penalty for guessing wrong in the other direction is a blocked account.
  if (source.BOOKING_MANAGER_SWEEP_CONCURRENCY > BM_MAX_SWEEP_CONCURRENCY) {
    throw new ContractError(
      `BOOKING_MANAGER_SWEEP_CONCURRENCY is ${source.BOOKING_MANAGER_SWEEP_CONCURRENCY}; the vendor allows ${BM_MAX_CONCURRENT_CALLS} concurrent calls per account and exceeding it can block the credential until their nightly restart, so the sweep is limited to ${BM_MAX_SWEEP_CONCURRENCY}`,
      { providerCode: "SWEEP_CONCURRENCY_TOO_HIGH" },
    );
  }

  return {
    baseUrl: source.BOOKING_MANAGER_BASE_URL.replace(/\/+$/, ""),
    apiToken,
    companyScope: companyScopeFromEnv(
      source.BOOKING_MANAGER_COMPANY_IDS,
      source.BOOKING_MANAGER_EXCLUDED_COMPANY_IDS,
    ),
    timeoutMs: source.BOOKING_MANAGER_TIMEOUT_MS,
    minIntervalMs: source.BOOKING_MANAGER_MIN_INTERVAL_MS,
    sweepConcurrency: source.BOOKING_MANAGER_SWEEP_CONCURRENCY,
    optionSafetyMarginMinutes: source.BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES,
    timeZone: source.BOOKING_MANAGER_TIMEZONE,
    queueKey: bookingManagerQueueKey(apiToken),
  };
}
