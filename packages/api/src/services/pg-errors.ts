/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";

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
  if (depth > 5 || typeof error !== "object" || error === null) return false;
  if ((error as { code?: string }).code === code) return true;
  return hasSqlState((error as { cause?: unknown }).cause, code, depth + 1);
}
