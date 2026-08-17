import { z } from "zod";

/* Postgres puts the specifics that identify a failure on the driver's Error, not in its text. */
const pgErrorSchema = z.object({
  code: z.string().min(1).optional(),
  constraint: z.string().min(1).optional(),
});

/** Deep enough for driver → orm → adapter; a longer chain is a loop, not information. */
const MAX_DEPTH = 5;

/**
 * An error and its causes as one line, **deepest first**.
 *
 * `sync_error.message` is stored truncated, and Drizzle opens its own message with the entire
 * failed statement and every bound parameter. The driver's actual complaint — "duplicate key
 * value violates unique constraint …" — therefore sat thousands of characters in and was cut
 * off before it ever reached the row: a real unique violation could only be diagnosed by
 * inferring it from the parameters that happened to survive inside the window.
 *
 * Reading the chain from the bottom puts the sentence that explains the failure first, so what
 * truncation now removes is the SQL, which is the right thing to lose.
 */
export function describeErrorChain(error: Error): string {
  /* A cause cycle would otherwise spin until MAX_DEPTH and repeat itself. */
  const seen = new Set<Error>();
  const chain: string[] = [];

  let current: Error | undefined = error;
  while (current !== undefined && chain.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current);
    chain.push(describe(current));
    current = current.cause instanceof Error ? current.cause : undefined;
  }

  return chain.reverse().join(" ← ");
}

function describe(error: Error): string {
  const pg = pgErrorSchema.safeParse(error).data;
  /* The constraint name is what turns "duplicate key" into a place to look. */
  const marks = [pg?.code, pg?.constraint].filter((mark) => mark !== undefined);

  return marks.length > 0 ? `${error.message} [${marks.join(" ")}]` : error.message;
}
