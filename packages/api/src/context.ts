import { auth } from "@yacht-charter/auth";
import { db } from "@yacht-charter/db";
import type * as dbSchema from "@yacht-charter/db/schema/index";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Context as HonoContext } from "hono";

// Annotated explicitly (without drizzle's `$client` intersection) so the inferred
// Context type stays portable — `$client` references pg's Pool, which consumers
// of this package cannot name.
export type Database = NodePgDatabase<typeof dbSchema>;

/**
 * A `Database` or an open transaction on one. Services that must run inside a
 * caller-supplied transaction take this so `db` and `tx` are interchangeable.
 */
export type DatabaseExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const contextDb: Database = db;

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    db: contextDb,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
