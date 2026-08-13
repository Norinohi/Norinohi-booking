import { z } from "zod";

import type { ProviderRecordSet, ProviderResourceType } from "../types";
import { ContractError } from "./errors";
import type { JsonField, JsonObject, JsonValue } from "./json";

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

/** Blank text is indistinguishable from absent text everywhere downstream. */
const presentTextSchema = z.string().trim().min(1);

/** Infinity and NaN survive JSON round-trips as nulls, never as usable numbers. */
const finiteNumberSchema = z.number().finite();

export function text(value: JsonField): string | undefined {
  return presentTextSchema.safeParse(value).data;
}

export function idOf(value: JsonField): string | null {
  const numeric = finiteNumberSchema.safeParse(value);
  if (numeric.success) return String(numeric.data);
  return text(value) ?? null;
}

export function objectsOf(items: JsonValue[]): JsonObject[] {
  // Kept as a filter rather than a schema parse: a catalogue dump runs tens of
  // thousands of records through here, and parsing would copy every one.
  return items.filter(
    (item): item is JsonObject => item instanceof Object && !Array.isArray(item),
  );
}

export function numberOf(value: JsonField): number | undefined {
  return finiteNumberSchema.safeParse(value).data;
}

export function intOf(value: JsonField): number | undefined {
  const parsed = numberOf(value);
  return parsed === undefined ? undefined : Math.round(parsed);
}

export function positiveInt(value: JsonField): number | undefined {
  const parsed = intOf(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function currencyOf(value: JsonField, fallback: string = FALLBACK_CURRENCY): string {
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
