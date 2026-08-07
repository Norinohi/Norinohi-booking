import { randomInt } from "node:crypto";

import { isUniqueViolation } from "./pg-errors";

/**
 * Unambiguous alphabet — these codes get read aloud, printed and retyped, so the
 * digit/letter collisions (0/O, 1/I) are left out. 24 letters + 8 digits, which
 * is 32^8 at the lengths in use.
 */
export const UNAMBIGUOUS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length: number, alphabet: string = UNAMBIGUOUS_ALPHABET): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

/**
 * Retries `insert` while the database rejects it for colliding with an existing
 * row, which is how a freshly generated code is claimed: the unique index is the
 * arbiter, not a prior SELECT.
 *
 * Returns undefined once the attempts run out rather than throwing, so each
 * caller keeps its own error — the messages name different resources and are
 * part of the API contract.
 */
export async function withUniqueRetry<T>(
  attempts: number,
  insert: () => Promise<T | undefined>,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const row = await insert();
      if (row) return row;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  return undefined;
}
