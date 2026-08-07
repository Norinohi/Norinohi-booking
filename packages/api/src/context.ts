import { auth } from "@yacht-charter/auth";
import { db } from "@yacht-charter/db";
import type * as dbSchema from "@yacht-charter/db/schema/index";
import { createInventoryProvider } from "@yacht-charter/providers";
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

// One adapter for the process, resolved from PROVIDER_MODE. Exposed here rather
// than built at module scope in each router so handlers take it from context the
// same way they take db.
const contextProvider = createInventoryProvider();

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
    provider: contextProvider,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
