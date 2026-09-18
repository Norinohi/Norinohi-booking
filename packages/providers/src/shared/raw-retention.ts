import { createHash } from "node:crypto";

import { newId } from "@yacht-charter/db/schema/_shared";
import { providerRawPayload } from "@yacht-charter/db/schema/provider";
import { type SQL, sql } from "drizzle-orm";

import { redactSecrets } from "./errors";

type RawPayloadInsert = typeof providerRawPayload.$inferInsert;

/**
 * Structural subset of the Drizzle executor. Typed against the table object from
 * the `@yacht-charter/db/schema/*` subpath rather than the package root, which
 * opens a connection pool at import time; a transaction handle satisfies it too.
 */
export interface RawPayloadWriter<TInsertResult> {
  insert(table: typeof providerRawPayload): {
    /*
     * Awaited for its effect only. The ids are the ones sent, so nothing here reads
     * what comes back - and the driver's own result type is left as a parameter
     * rather than pinned, so this stand-in does not have to restate it.
     */
    values(rows: RawPayloadInsert[]): PromiseLike<TInsertResult>;
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
 * Persists the exact provider responses before anything maps them, and returns
 * their ids positionally. NauSYS repeats plaintext credentials in every request
 * body, so retention is the one place that must never store a payload verbatim.
 *
 * Ids are minted here rather than read back out of `RETURNING`. The caller writes
 * a `provider_record` pointing at each of these in the same batch, so it has to
 * know which id belongs to which payload - and matching returned rows to inserted
 * values by position would rest on an ordering Postgres does not guarantee.
 */
export async function retainRawPayloads<TInsertResult>(
  db: RawPayloadWriter<TInsertResult>,
  providerId: string,
  payloads: readonly unknown[],
): Promise<string[]> {
  if (payloads.length === 0) return [];

  const rows = payloads.map((payload) => ({
    id: newId("praw"),
    providerId,
    payload: redactSecrets(payload),
  }));

  await db.insert(providerRawPayload).values(rows);
  return rows.map((row) => row.id);
}

/** Structural subset of the Drizzle executor `pruneOrphanedRawPayloads` needs. */
export interface RawPayloadPruner {
  execute(query: SQL): PromiseLike<{ rowCount: number | null }>;
}

export interface PruneRawPayloadsOptions {
  /*
   * The grace is what makes this safe beside a writer. `writeRecords` inserts a payload and the
   * record pointing at it in one transaction, and only ever points a record at a payload it has
   * just minted, so a payload no record references is either one that was replaced or one whose
   * record has not committed yet. The second kind is seconds old, never a day.
   */
  graceSeconds?: number;
  batchSize?: number;
}

const DEFAULT_PRUNE_GRACE_SECONDS = 24 * 60 * 60;
const DEFAULT_PRUNE_BATCH = 5000;

/**
 * Deletes the payloads a changed record left behind when it was repointed at its new one.
 *
 * Every reader reaches a payload through `provider_record.raw_payload_id`, so an unreferenced
 * payload is unreachable, and without this each changed record adds one forever.
 *
 * In bounded batches, each its own statement, so no single delete holds its locks for long.
 * `provider_record.raw_payload_id` is `on delete set null` and unindexed, so every deleted row
 * costs Postgres a scan of that table for the referential action; the batch keeps that bounded
 * per statement too.
 */
export async function pruneOrphanedRawPayloads(
  db: RawPayloadPruner,
  providerId: string,
  options: PruneRawPayloadsOptions = {},
): Promise<number> {
  const graceSeconds = options.graceSeconds ?? DEFAULT_PRUNE_GRACE_SECONDS;
  const batchSize = options.batchSize ?? DEFAULT_PRUNE_BATCH;

  let deleted = 0;
  for (;;) {
    // The cutoff is Postgres' clock, not ours: `created_at` is a zoneless timestamp its own
    // `now()` filled, and a Date bound from here would be read in whatever zone the session has.
    const result = await db.execute(sql`
      delete from provider_raw_payload
      where id in (
        select rp.id
        from provider_raw_payload rp
        where rp.provider_id = ${providerId}
          and rp.created_at < now() - make_interval(secs => ${graceSeconds})
          and not exists (
            select 1 from provider_record r where r.raw_payload_id = rp.id
          )
        limit ${batchSize}
      )
    `);
    const count = result.rowCount ?? 0;
    deleted += count;
    if (count < batchSize) return deleted;
  }
}
