import { env } from "@yacht-charter/env/server";

import { type CompanyScope, companyScopeFromEnv } from "../shared/company-scope";
import { AuthError } from "../shared/errors";

export interface NausysConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  /**
   * Per-attempt timeout for the sync lane only. Catalogue fleet dumps are orders
   * of magnitude slower than the live calls `timeoutMs` is sized for.
   */
  syncTimeoutMs: number;
  minIntervalMs: number;
  /** `holdExpiresAt = optionTill − this`, so our sweeper releases first. */
  optionSafetyMarginMinutes: number;
  /**
   * Zone the vendor's naked `optionTill` wall-clock is read in. NauSYS confirmed
   * (Aug 2026) that API datetimes are CET/CEST with daylight saving applied
   * automatically, so this must stay a real IANA zone in that offset family; a
   * fixed "+01:00" would be an hour wrong all summer.
   *
   * It does NOT apply to base check-in and check-out times. Those are local to
   * the base, so a Caribbean base checking in at 10:00 means 10:00 there, not
   * 10:00 CET. We keep them as plain wall-clock strings and never convert them.
   */
  optionTimeZone: string;
  /** Which charter companies to import. Unconfigured means every company the credential can see. */
  companyScope: CompanyScope;
  /**
   * Base of every serialization key: the lanes in `client.ts` are suffixes of it.
   * Keyed by credential, never by instance, so two clients in one process share
   * the lane the vendor's sequential-only rule still applies to.
   */
  queueKey: string;
}

/** The slice of the server env this adapter reads. */
export interface NausysEnvSource {
  NAUSYS_BASE_URL: string;
  NAUSYS_USERNAME?: string | undefined;
  NAUSYS_PASSWORD?: string | undefined;
  NAUSYS_TIMEOUT_MS: number;
  NAUSYS_SYNC_TIMEOUT_MS: number;
  NAUSYS_MIN_INTERVAL_MS: number;
  NAUSYS_OPTION_SAFETY_MARGIN_MINUTES: number;
  NAUSYS_OPTION_TIMEZONE: string;
  NAUSYS_COMPANY_IDS?: string | undefined;
  NAUSYS_EXCLUDED_COMPANY_IDS?: string | undefined;
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
    syncTimeoutMs: source.NAUSYS_SYNC_TIMEOUT_MS,
    minIntervalMs: source.NAUSYS_MIN_INTERVAL_MS,
    optionSafetyMarginMinutes: source.NAUSYS_OPTION_SAFETY_MARGIN_MINUTES,
    optionTimeZone: source.NAUSYS_OPTION_TIMEZONE,
    companyScope: companyScopeFromEnv(
      source.NAUSYS_COMPANY_IDS,
      source.NAUSYS_EXCLUDED_COMPANY_IDS,
    ),
    queueKey: nausysQueueKey(username),
  };
}
