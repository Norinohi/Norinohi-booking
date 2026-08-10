import { env } from "@yacht-charter/env/server";

import { AuthError } from "../shared/errors";

export interface NausysConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  minIntervalMs: number;
  /** `holdExpiresAt = optionTill − this`, so our sweeper releases first. */
  optionSafetyMarginMinutes: number;
  /** Zone the vendor's naked `optionTill` wall-clock is read in. */
  optionTimeZone: string;
  /** Serialization key. One lane per credential, never per instance. */
  queueKey: string;
}

/** The slice of the server env this adapter reads. */
export interface NausysEnvSource {
  NAUSYS_BASE_URL: string;
  NAUSYS_USERNAME?: string | undefined;
  NAUSYS_PASSWORD?: string | undefined;
  NAUSYS_TIMEOUT_MS: number;
  NAUSYS_MIN_INTERVAL_MS: number;
  NAUSYS_OPTION_SAFETY_MARGIN_MINUTES: number;
  NAUSYS_OPTION_TIMEZONE: string;
}

export function nausysQueueKey(username: string): string {
  return `nausys:${username}`;
}

/**
 * Credentials are optional in the env schema so a missing secret cannot stop the
 * server booting. The cost is that this is the point where nausys mode has to
 * refuse loudly rather than issue unauthenticated calls.
 */
export function resolveNausysConfig(source: NausysEnvSource = env): NausysConfig {
  const username = source.NAUSYS_USERNAME?.trim();
  const password = source.NAUSYS_PASSWORD;

  if (!username || !password) {
    throw new AuthError(
      "NauSYS credentials are not configured: set NAUSYS_USERNAME and NAUSYS_PASSWORD",
      { providerCode: "MISSING_CREDENTIALS" },
    );
  }

  return {
    baseUrl: source.NAUSYS_BASE_URL.replace(/\/+$/, ""),
    username,
    password,
    timeoutMs: source.NAUSYS_TIMEOUT_MS,
    minIntervalMs: source.NAUSYS_MIN_INTERVAL_MS,
    optionSafetyMarginMinutes: source.NAUSYS_OPTION_SAFETY_MARGIN_MINUTES,
    optionTimeZone: source.NAUSYS_OPTION_TIMEZONE,
    queueKey: nausysQueueKey(username),
  };
}
