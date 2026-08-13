import { z } from "zod";

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
