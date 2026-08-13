import { auth } from "@yacht-charter/auth";
import { db } from "@yacht-charter/db";
import type * as dbSchema from "@yacht-charter/db/schema/index";
import {
  createEnabledInventoryProviders,
  createInventoryProvider,
  type InventoryProvider,
} from "@yacht-charter/providers";
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
// same way they take db. Exported for the transport entry points that run without
// a request context (the cron sweep, the Stripe webhook), so they inject this same
// instance instead of building a second one.
export const inventoryProvider = createInventoryProvider({ db: contextDb });

/**
 * Every enabled provider, for the paths that import rather than transact.
 *
 * Resolved lazily and memoized: it reads the `provider` table, and the module is
 * imported at server boot before the database is necessarily reachable. Callers
 * await it; `inventoryProvider` above stays synchronous because checkout cannot
 * wait on a query to know who it is selling through.
 */
let enabledProviders: Promise<Map<string, InventoryProvider>> | null = null;

export function getEnabledInventoryProviders(): Promise<Map<string, InventoryProvider>> {
  // Reset on failure so a boot-time database blip is retried rather than cached
  // as an empty fleet that silently syncs nothing.
  return (enabledProviders ??= createEnabledInventoryProviders({ db: contextDb }).catch(
    (error: unknown) => {
      enabledProviders = null;
      throw error;
    },
  ));
}

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
    provider: inventoryProvider,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
