import { ContractError } from "../shared/errors";
import { wallClockToInstant } from "../shared/dates";

/**
 * MMK support confirmed (Aug 2026) the asymmetry: we must send `T` between date
 * and time, and the vendor answers with a space. Neither direction ever carries
 * a zone suffix, so both are naked CET/CEST wall clocks.
 */
const BM_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length: number): string {
  return value.toString().padStart(length, "0");
}

function assertRealDate(year: number, month: number, day: number, raw: string): void {
  if (month < 1 || month > 12 || day < 1) {
    throw new ContractError(`Malformed date: ${JSON.stringify(raw)}`);
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    throw new ContractError(`Malformed date: ${JSON.stringify(raw)}`);
  }
}

/**
 * Reads `"2026-08-08 17:00:00"` (the response shape) or the `T` variant we send.
 * Ambiguous fall-back clocks resolve to the earlier instant - see
 * `wallClockToInstant`.
 */
export function parseBookingManagerDateTime(value: unknown, timeZone: string): Date {
  if (typeof value !== "string") {
    throw new ContractError(
      `Expected a yyyy-MM-dd HH:mm:ss datetime string, received ${typeof value}`,
    );
  }
  const match = BM_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) {
    throw new ContractError(`Malformed datetime: ${JSON.stringify(value)}`);
  }
  const [, year = "", month = "", day = "", hour = "", minute = "", second = "0"] = match;
  assertRealDate(Number(year), Number(month), Number(day), value);

  const hours = Number(hour);
  const minutes = Number(minute);
  const seconds = Number(second);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new ContractError(`Malformed datetime: ${JSON.stringify(value)}`);
  }

  return wallClockToInstant(
    { year: Number(year), month: Number(month), day: Number(day), hours, minutes, seconds },
    timeZone,
  );
}

/** The calendar date only, as the vendor wrote it: `"2026-08-08 17:00:00"` -> `"2026-08-08"`. */
export function parseBookingManagerDate(value: unknown): string {
  if (typeof value !== "string") {
    throw new ContractError(`Expected a yyyy-MM-dd date string, received ${typeof value}`);
  }
  const trimmed = value.trim();
  const match = BM_DATE_TIME_PATTERN.exec(trimmed) ?? ISO_DATE_PATTERN.exec(trimmed);
  if (!match) {
    throw new ContractError(`Malformed date: ${JSON.stringify(value)}`);
  }
  const [, year = "", month = "", day = ""] = match;
  assertRealDate(Number(year), Number(month), Number(day), value);
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
  if (typeof date !== "string") {
    throw new ContractError(`Expected a yyyy-MM-dd date string, received ${typeof date}`);
  }
  const match = ISO_DATE_PATTERN.exec(date.trim());
  if (!match) {
    throw new ContractError(`Malformed ISO date: ${JSON.stringify(date)}`);
  }
  const [, year = "", month = "", day = ""] = match;
  assertRealDate(Number(year), Number(month), Number(day), date);

  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!timeMatch) {
    throw new ContractError(`Malformed time: ${JSON.stringify(time)}`);
  }
  const [, hour = "", minute = "", second = "00"] = timeMatch;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new ContractError(`Malformed time: ${JSON.stringify(time)}`);
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${pad(Number(second), 2)}`;
}
