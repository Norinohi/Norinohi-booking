import { z } from "zod";

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** The only fields of a thrown value these checks read. */
const sqlStateCarrierSchema = z.object({
  code: z.string().optional(),
  constraint: z.string().optional(),
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

/**
 * Which constraint a unique violation names, where the driver reported one.
 *
 * `pg` puts the constraint on its DatabaseError, and it is the only thing that
 * separates "this generated reference is taken, make another" from "another request
 * already claimed this idempotency key" — two collisions that need opposite answers
 * and are otherwise the same SQLSTATE.
 *
 * Walks `cause` for the reason `isUniqueViolation` does: Drizzle wraps driver errors.
 */
export function violatedConstraint(error: unknown, depth = 0): string | undefined {
  if (depth > 5) return undefined;
  const carrier = sqlStateCarrierSchema.safeParse(error);
  if (!carrier.success) return undefined;
  if (carrier.data.constraint) return carrier.data.constraint;
  return violatedConstraint(carrier.data.cause, depth + 1);
}
