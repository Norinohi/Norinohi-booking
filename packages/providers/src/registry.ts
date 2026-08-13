import type * as dbSchema from "@yacht-charter/db/schema/index";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { env } from "@yacht-charter/env/server";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { InventoryProvider } from "./provider";
import { type ProviderKey, providerKeySchema } from "./types";
import { databaseInventorySource } from "./mock/inventory";
import { MockInventoryProvider } from "./mock/provider";
import { NausysInventoryProvider } from "./nausys/provider";
import type { NausysConfig } from "./nausys/config";
import { BookingManagerInventoryProvider } from "./booking-manager/provider";
import type { BookingManagerConfig } from "./booking-manager/config";

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
  /** Same escape hatch as `nausysConfig`, for the Booking Manager bearer token. */
  bookingManagerConfig?: BookingManagerConfig;
};

/**
 * Every provider whose row is enabled, keyed by provider code.
 *
 * Sync fans out over this; the booking path does not. `PROVIDER_MODE` still picks
 * the single adapter that quotes and transacts, because an offer has exactly one
 * source and checkout must not have to choose. Importing from two vendors and
 * selling through one are genuinely different questions.
 *
 * Driven by the `provider.enabled` column rather than a second env var so an
 * operator can turn a connector off without a deploy, and so enabling one that has
 * no credentials fails loudly at construction instead of being silently skipped.
 */
export async function createEnabledInventoryProviders(
  deps: ProviderDeps,
): Promise<Map<ProviderKey, InventoryProvider>> {
  const rows = await deps.db
    .select({ code: providerTable.code })
    .from(providerTable)
    .where(eq(providerTable.enabled, true));

  const providers = new Map<ProviderKey, InventoryProvider>();
  for (const row of rows) {
    const parsed = providerKeySchema.safeParse(row.code);
    // A code we cannot build is a row someone added by hand, not a reason to
    // abandon the run: the other providers still sync.
    if (!parsed.success) continue;
    // The mock is seeded enabled so local development can transact against it, but
    // it is a fixture rather than a vendor. Letting a scheduled fan-out import it
    // would write invented yachts into a real catalogue alongside genuine ones.
    // A deliberate mock import still works through PROVIDER_MODE and the scripts.
    if (parsed.data === "mock") continue;
    providers.set(parsed.data, createInventoryProvider(deps, parsed.data));
  }
  return providers;
}

export function createInventoryProvider(
  deps: ProviderDeps,
  mode = env.PROVIDER_MODE,
): InventoryProvider {
  switch (mode) {
    case "mock":
      // Quotes the same `availability_slot` rows the catalogue publishes. Fixture
      // inventory covered ten of the seeded listings, so the calendar offered
      // weeks the quote endpoint then refused.
      return new MockInventoryProvider({ inventory: databaseInventorySource(deps.db) });
    case "nausys":
      return new NausysInventoryProvider({ db: deps.db, config: deps.nausysConfig });
    case "booking_manager":
      return new BookingManagerInventoryProvider({
        db: deps.db,
        config: deps.bookingManagerConfig,
      });
  }
}
