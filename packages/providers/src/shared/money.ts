import { z } from "zod";

import { ContractError } from "./errors";
import { requireJsonString } from "./json";

const ZERO_EXPONENT_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);
const THREE_EXPONENT_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

const currencyCodeSchema = z
  .string()
  .transform((code) => code.trim().toUpperCase());

export function currencyExponent(currency: string): number {
  // An unreadable code is not worth throwing over: the minor-unit exponent it
  // falls through to is the one almost every currency uses.
  const code = currencyCodeSchema.safeParse(currency).data ?? "";
  if (ZERO_EXPONENT_CURRENCIES.has(code)) {
    return 0;
  }
  if (THREE_EXPONENT_CURRENCIES.has(code)) {
    return 3;
  }
  return 2;
}

/**
 * NauSYS money arrives as decimal strings ("3340.00"). Parsing is string-based
 * end to end: `parseFloat` would silently round values a cent off.
 */
export function decimalStringToMinor(value: string, currency: string): number {
  const trimmed = requireJsonString(value, "a decimal string amount").trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new ContractError(`Malformed decimal amount: ${JSON.stringify(value)}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [integerPart = "", fractionPart = ""] = unsigned.split(".");

  const exponent = currencyExponent(currency);
  // Truncate toward zero rather than round: a provider sending more precision
  // than the currency has is a data problem, and rounding up would overcharge.
  const scaledFraction = fractionPart.slice(0, exponent).padEnd(exponent, "0");

  const magnitude = Number(`${integerPart}${scaledFraction}`);
  if (!Number.isSafeInteger(magnitude)) {
    throw new ContractError(`Amount out of safe integer range: ${JSON.stringify(value)}`);
  }

  return magnitude === 0 ? 0 : negative ? -magnitude : magnitude;
}

export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) {
    throw new ContractError(`Expected a safe integer minor amount, received ${String(minor)}`);
  }

  const exponent = currencyExponent(currency);
  const sign = minor < 0 ? "-" : "";
  const digits = Math.abs(minor).toString();

  if (exponent === 0) {
    return `${sign}${digits}`;
  }

  const padded = digits.padStart(exponent + 1, "0");
  const cut = padded.length - exponent;
  return `${sign}${padded.slice(0, cut)}.${padded.slice(cut)}`;
}
