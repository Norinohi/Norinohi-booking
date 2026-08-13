import type { z } from "zod";

import type { ProviderRecordSet, ProviderResourceType } from "../types";
import { ContractError } from "./errors";

/** Last resort only when a payload names no currency of its own. */
const FALLBACK_CURRENCY = "EUR";

export function parseAll<TSchema extends z.ZodType>(
  records: ProviderRecordSet,
  resourceType: ProviderResourceType,
  schema: TSchema,
): z.infer<TSchema>[] {
  const parsed: z.infer<TSchema>[] = [];
  for (const entry of records.get(resourceType) ?? []) {
    const result = schema.safeParse(entry.payload);
    // One unparseable record is dropped rather than thrown: it is already retained
    // raw, and the run is worth more than the row.
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function idOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}

export function objectsOf(items: unknown[]): Record<string, unknown>[] {
  return items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

export function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function intOf(value: unknown): number | undefined {
  const parsed = numberOf(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

export function positiveInt(value: unknown): number | undefined {
  const parsed = intOf(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function currencyOf(value: unknown, fallback: string = FALLBACK_CURRENCY): string {
  const code = text(value);
  return code && code.length === 3 ? code.toUpperCase() : fallback;
}

/**
 * The vendor ids we send back on a quote or a booking. A non-integer id is a
 * contract breach rather than a value to coerce: it would address another boat.
 */
export function toPositiveIntId(value: string, labels: { provider: string; what: string }): number {
  const id = Number(value);
  if (!value || !Number.isSafeInteger(id) || id <= 0) {
    throw new ContractError(
      `${labels.provider} needs a positive integer for ${labels.what}, received ${JSON.stringify(value)}`,
    );
  }
  return id;
}
