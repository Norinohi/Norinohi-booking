import { createHash } from "node:crypto";

import { providerRawPayload } from "@yacht-charter/db/schema/provider";

import { redactSecrets } from "./errors";

type RawPayloadInsert = typeof providerRawPayload.$inferInsert;

/**
 * Structural subset of the Drizzle executor. Typed against the table object from
 * the `@yacht-charter/db/schema/*` subpath rather than the package root, which
 * opens a connection pool at import time; a transaction handle satisfies it too.
 */
export interface RawPayloadWriter {
  insert(table: typeof providerRawPayload): {
    values(value: RawPayloadInsert): {
      returning(fields: { id: typeof providerRawPayload.id }): PromiseLike<{ id: string }[]>;
    };
  };
}

function canonicalize(value: unknown, seen: WeakSet<object>): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }
  if (typeof value !== "object") {
    return "null";
  }
  if (seen.has(value)) {
    return '"[circular]"';
  }
  seen.add(value);

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    // Codepoint order, not locale order: the hash has to be reproducible on any
    // machine and any ICU build.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, seen)}`).join(",")}}`;
}

/** Canonical JSON with recursively sorted object keys. */
export function canonicalJson(payload: unknown): string {
  return canonicalize(payload, new WeakSet());
}

/**
 * Change detection for a full catalogue dump. Key order must not matter: the
 * vendors reorder fields between responses, and `JSON.stringify` would then
 * report every unchanged record as changed and rewrite the whole raw table.
 */
export function stableSourceHash(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

/**
 * Persists the exact provider response before anything maps it. NauSYS repeats
 * plaintext credentials in every request body, so retention is the one place
 * that must never store a payload verbatim.
 */
export async function retainRawPayload(
  db: RawPayloadWriter,
  providerId: string,
  payload: unknown,
): Promise<string> {
  const [row] = await db
    .insert(providerRawPayload)
    .values({ providerId, payload: redactSecrets(payload) })
    .returning({ id: providerRawPayload.id });

  if (!row) {
    throw new Error("provider_raw_payload insert returned no row");
  }
  return row.id;
}
