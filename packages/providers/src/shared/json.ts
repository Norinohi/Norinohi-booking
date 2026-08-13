import { z } from "zod";

import { ContractError } from "./errors";

/**
 * Everything a provider hands us arrives through `JSON.parse`, so a raw payload
 * is never genuinely `unknown`: it is a JSON value whose structure we have not
 * established yet. Saying so lets the coercion helpers in `projection-helpers`
 * take a real domain type while still accepting anything a vendor sends.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

/** Reading an absent key yields undefined, which JSON itself cannot represent. */
export type JsonField = JsonValue | undefined;

/**
 * A vendor object we validate loosely: the declared keys are checked, and every
 * undeclared key is kept as JSON rather than dropped.
 *
 * This is `z.looseObject` with a typed catchall. Both vendors add fields between
 * minor releases, so the extra keys have to survive parsing; typing them as JSON
 * instead of `unknown` is what lets the projection helpers read them without an
 * assertion at every call site.
 */
export function looseJsonObject<TFields extends Record<string, z.ZodType>>(fields: TFields) {
  return z.object(fields).catchall(z.json());
}

const jsonStringSchema = z.string();

/**
 * Reads a field that has to be a string before anything else can look at it.
 *
 * Both vendors have sent null where their own schema promised a string, so the
 * check stays even where the caller's parameter is already typed. Failing here
 * names the provider seam as a ContractError; letting it through surfaces a bare
 * TypeError from `.trim()` several frames away.
 */
export function requireJsonString(value: JsonField, expected: string): string {
  const parsed = jsonStringSchema.safeParse(value);
  if (!parsed.success) {
    throw new ContractError(`Expected ${expected}, received ${JSON.stringify(value)}`);
  }
  return parsed.data;
}
