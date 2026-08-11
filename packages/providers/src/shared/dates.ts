import { ContractError } from "./errors";

const NAUSYS_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const NAUSYS_DATE_TIME_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function assertRealDate(parts: DateParts, raw: string): void {
  const { year, month, day } = parts;
  if (month < 1 || month > 12 || day < 1) {
    throw new ContractError(`Malformed date: ${JSON.stringify(raw)}`);
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) {
    throw new ContractError(`Malformed date: ${JSON.stringify(raw)}`);
  }
}

function pad(value: number, length: number): string {
  return value.toString().padStart(length, "0");
}

function readNausysDateParts(value: unknown, raw: string): DateParts {
  if (typeof value !== "string") {
    throw new ContractError(`Expected a dd.MM.yyyy date string, received ${typeof value}`);
  }
  const match = NAUSYS_DATE_PATTERN.exec(value.trim());
  if (!match) {
    throw new ContractError(`Malformed date: ${JSON.stringify(raw)}`);
  }
  const [, day = "", month = "", year = ""] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day) };
  assertRealDate(parts, raw);
  return parts;
}

/** `"08.08.2026"` -> `"2026-08-08"`. */
export function parseNausysDate(value: string): string {
  const { year, month, day } = readNausysDateParts(value, value);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `"2026-08-08"` -> `"08.08.2026"`. */
export function formatNausysDate(value: string): string {
  if (typeof value !== "string") {
    throw new ContractError(`Expected a yyyy-MM-dd date string, received ${typeof value}`);
  }
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    throw new ContractError(`Malformed ISO date: ${JSON.stringify(value)}`);
  }
  const [, year = "", month = "", day = ""] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day) };
  assertRealDate(parts, value);
  return `${pad(parts.day, 2)}.${pad(parts.month, 2)}.${pad(parts.year, 4)}`;
}

// Constructing a DateTimeFormat is expensive and a catalogue sync parses tens of
// thousands of timestamps, so the formatter is cached per zone.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (cause) {
    throw new ContractError(`Unknown IANA time zone: ${JSON.stringify(timeZone)}`, { cause });
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(instantMs));
  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(
    values.year ?? 0,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    (values.hour ?? 0) % 24,
    values.minute ?? 0,
    values.second ?? 0,
  );
  // formatToParts resolves to whole seconds, so compare against a floored instant.
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * NauSYS datetimes carry no timezone, so the wall-clock reading is interpreted
 * in `timeZone`. Non-existent local times (spring forward) shift forward past
 * the gap; ambiguous ones (fall back) resolve to the earlier occurrence.
 *
 * Note this is for provider *timestamps* only. Base check-in and check-out
 * times are local to the base rather than CET, per the vendor, so they stay
 * plain wall-clock strings and must never be run through here.
 */
export function parseNausysDateTime(value: string, timeZone: string): Date {
  if (typeof value !== "string") {
    throw new ContractError(
      `Expected a dd.MM.yyyy HH:mm datetime string, received ${typeof value}`,
    );
  }
  const match = NAUSYS_DATE_TIME_PATTERN.exec(value.trim());
  if (!match) {
    throw new ContractError(`Malformed datetime: ${JSON.stringify(value)}`);
  }
  const [, day = "", month = "", year = "", hour = "", minute = "", second = "0"] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day) };
  assertRealDate(parts, value);

  const hours = Number(hour);
  const minutes = Number(minute);
  const seconds = Number(second);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new ContractError(`Malformed datetime: ${JSON.stringify(value)}`);
  }

  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes, seconds);

  // NauSYS confirmed (Aug 2026) that its datetimes are CET/CEST with daylight
  // saving applied automatically, so the zone must be a real IANA zone and never
  // a fixed offset, which would be an hour wrong for half the year.
  //
  // On the autumn fall-back an hour repeats and the wall clock is ambiguous. We
  // resolve to the EARLIER instant, which is the larger offset. These values are
  // mostly deadlines (optionTill), and reading a deadline late is what lets us
  // sell a slot the provider has already released; reading it early only costs
  // us an hour of hold we were not promised.
  const candidates = [
    naive - zoneOffsetMs(naive - HALF_DAY_MS, timeZone),
    naive - zoneOffsetMs(naive + HALF_DAY_MS, timeZone),
  ];
  const consistent = candidates.filter(
    (instant) => naive - zoneOffsetMs(instant, timeZone) === instant,
  );

  // No consistent reading means the wall clock never happened (spring forward);
  // the two-pass result lands just after the gap, which is the only sane answer.
  if (consistent.length === 0) {
    const firstPass = naive - zoneOffsetMs(naive, timeZone);
    return new Date(naive - zoneOffsetMs(firstPass, timeZone));
  }

  return new Date(Math.min(...consistent));
}
