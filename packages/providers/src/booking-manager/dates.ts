import {
  assertRealClock,
  assertRealDate,
  pad,
  wallClockToInstant,
} from "../shared/dates";
import { ContractError } from "../shared/errors";

import { requireJsonString, type JsonField } from "../shared/json";

/**
 * MMK support confirmed (Aug 2026) the asymmetry: we must send `T` between date
 * and time, and the vendor answers with a space. Neither direction ever carries
 * a zone suffix, so both are naked CET/CEST wall clocks.
 */
const BM_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Reads `"2026-08-08 17:00:00"` (the response shape) or the `T` variant we send.
 * Ambiguous fall-back clocks resolve to the earlier instant - see
 * `wallClockToInstant`.
 */
export function parseBookingManagerDateTime(value: JsonField, timeZone: string): Date {
  const text = requireJsonString(value, "a yyyy-MM-dd HH:mm:ss datetime string");
  const match = BM_DATE_TIME_PATTERN.exec(text.trim());
  if (!match) {
    throw new ContractError(`Malformed datetime: ${JSON.stringify(value)}`);
  }
  const [, year = "", month = "", day = "", hour = "", minute = "", second = "0"] = match;
  assertRealDate({ year: Number(year), month: Number(month), day: Number(day) }, text);

  const hours = Number(hour);
  const minutes = Number(minute);
  const seconds = Number(second);
  assertRealClock({ hours, minutes, seconds }, `Malformed datetime: ${JSON.stringify(value)}`);

  return wallClockToInstant(
    { year: Number(year), month: Number(month), day: Number(day), hours, minutes, seconds },
    timeZone,
  );
}

/** The calendar date only, as the vendor wrote it: `"2026-08-08 17:00:00"` -> `"2026-08-08"`. */
export function parseBookingManagerDate(value: JsonField): string {
  const trimmed = requireJsonString(value, "a yyyy-MM-dd date string").trim();
  const match = BM_DATE_TIME_PATTERN.exec(trimmed) ?? ISO_DATE_PATTERN.exec(trimmed);
  if (!match) {
    throw new ContractError(`Malformed date: ${JSON.stringify(value)}`);
  }
  const [, year = "", month = "", day = ""] = match;
  assertRealDate({ year: Number(year), month: Number(month), day: Number(day) }, trimmed);
  return `${year}-${month}-${day}`;
}

/**
 * `"2026-08-08"` -> `"2026-08-08T00:00:00"`. Seconds are mandatory even though
 * charters rarely use them: MMK confirmed the call is rejected without them.
 *
 * The `00:00:00` default is not a placeholder. On `/offers` the vendor requires
 * midnight and substitutes the base's real check-in/check-out time in the
 * response, so asking for a specific time there is wrong, not merely redundant.
 */
export function formatBookingManagerDateTime(date: string, time = "00:00:00"): string {
  const text = requireJsonString(date, "a yyyy-MM-dd date string");
  const match = ISO_DATE_PATTERN.exec(text.trim());
  if (!match) {
    throw new ContractError(`Malformed ISO date: ${JSON.stringify(date)}`);
  }
  const [, year = "", month = "", day = ""] = match;
  assertRealDate({ year: Number(year), month: Number(month), day: Number(day) }, date);

  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!timeMatch) {
    throw new ContractError(`Malformed time: ${JSON.stringify(time)}`);
  }
  const [, hour = "", minute = "", second = "00"] = timeMatch;
  assertRealClock(
    { hours: Number(hour), minutes: Number(minute), seconds: Number(second) },
    `Malformed time: ${JSON.stringify(time)}`,
  );
  return `${year}-${month}-${day}T${hour}:${minute}:${pad(Number(second), 2)}`;
}
