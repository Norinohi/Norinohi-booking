import { z } from "zod";

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** The only two fields of a thrown value this check reads. */
const sqlStateCarrierSchema = z.object({
  code: z.string().optional(),
  cause: z.unknown().optional(),
});

/**
 * Whether an error is a unique-constraint violation.
 *
 * Walks `cause`, because Drizzle wraps driver errors in its own DrizzleQueryError
 * — checking only the top level silently misses every violation and lets the raw
 * failed statement, parameters included, reach the API response.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, UNIQUE_VIOLATION);
}

function hasSqlState(error: unknown, code: string, depth = 0): boolean {
  if (depth > 5) return false;
  const carrier = sqlStateCarrierSchema.safeParse(error);
  if (!carrier.success) return false;
  if (carrier.data.code === code) return true;
  return hasSqlState(carrier.data.cause, code, depth + 1);
}
