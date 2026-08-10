import type * as dbSchema from "@yacht-charter/db/schema/index";
import { env } from "@yacht-charter/env/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { InventoryProvider } from "./provider";
import { MockInventoryProvider } from "./mock/provider";
import { NausysInventoryProvider } from "./nausys/provider";
import type { NausysConfig } from "./nausys/config";

// Imported from the schema subpath rather than the package root, which opens a
// connection pool at import time. Annotated without drizzle's `$client`
// intersection so the type stays nameable by consumers.
export type Database = NodePgDatabase<typeof dbSchema>;

export type ProviderDeps = {
  /**
   * Real adapters resolve our `ylst_` listing ids to the provider's own yacht ids
   * through `listing_source` → `provider_record`, so they cannot be built without
   * a database handle.
   */
  db: Database;
  /**
   * Overrides the credentials the NauSYS adapter would otherwise read from the
   * environment. Supplied by tests and by any caller running a second credential
   * (a sync-only account keeps its own serialization lane).
   */
  nausysConfig?: NausysConfig;
};

export function createInventoryProvider(
  deps: ProviderDeps,
  mode = env.PROVIDER_MODE,
): InventoryProvider {
  switch (mode) {
    case "mock":
      // The mock answers from fixtures, so it needs no database handle.
      return new MockInventoryProvider();
    case "nausys":
      return new NausysInventoryProvider({ db: deps.db, config: deps.nausysConfig });
    case "booking_manager":
      throw new Error(`Provider mode "${mode}" is not implemented yet`);
  }
}
