import { auth } from "@yacht-charter/auth";
import { db } from "@yacht-charter/db";
import type * as dbSchema from "@yacht-charter/db/schema/index";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Context as HonoContext } from "hono";

// Annotated explicitly (without drizzle's `$client` intersection) so the inferred
// Context type stays portable — `$client` references pg's Pool, which consumers
// of this package cannot name.
export type Database = NodePgDatabase<typeof dbSchema>;

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
