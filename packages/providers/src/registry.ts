import type * as dbSchema from "@yacht-charter/db/schema/index";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { env } from "@yacht-charter/env/server";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { InventoryProvider } from "./provider";
import { AuthError } from "./shared/errors";
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
 * Providers this deployment could sync, before credentials are considered.
 *
 * A missing row means the provider has never synced here, not that it is off:
 * the row is created by the sync itself, so reading only existing rows meant a
 * new connector could never bootstrap. `enabled: false` on an existing row is
 * the explicit off switch and is respected.
 *
 * The mock is excluded outright. It is seeded enabled so local development can
 * transact against it, but it is a fixture rather than a vendor, and a scheduled
 * fan-out importing it would write invented yachts beside real ones.
 */
export function syncCandidateKeys(
  rows: readonly { code: string; enabled: boolean }[],
): ProviderKey[] {
  const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.code));

  return providerKeySchema.options.filter((key) => key !== "mock" && !disabled.has(key));
}

/**
 * Every provider this deployment can actually sync, keyed by provider code.
 *
 * Sync fans out over this; the booking path does not. `PROVIDER_MODE` still picks
 * the single adapter used for a listing with no provider source, because an offer
 * has exactly one source and checkout must not have to choose. Importing from two
 * vendors and selling through one are genuinely different questions.
 *
 * A provider whose credentials are absent here is skipped rather than raised: a
 * deployment that only holds one vendor's key is a normal configuration, and the
 * other vendor's absence must not stop the run.
 */
export async function createEnabledInventoryProviders(
  deps: ProviderDeps,
): Promise<Map<ProviderKey, InventoryProvider>> {
  const rows = await deps.db
    .select({ code: providerTable.code, enabled: providerTable.enabled })
    .from(providerTable);

  const providers = new Map<ProviderKey, InventoryProvider>();
  for (const key of syncCandidateKeys(rows)) {
    try {
      providers.set(key, createInventoryProvider(deps, key));
    } catch (error) {
      if (error instanceof AuthError) continue;
      throw error;
    }
  }
  return providers;
}

/**
 * Narrows a sync fan-out to the provider `--provider <code>` names, or leaves it whole.
 *
 * `createEnabledInventoryProviders` answers who this deployment *could* import from, which is
 * the right question on a schedule: a deployment holding two vendors' keys wants both walked
 * nightly. It is usually the wrong one by hand, where the reason to run a sync is that vendor
 * alone — and the workaround was flipping `provider.enabled` in the database around the run,
 * which leaves the other vendor switched off for good if the run dies before flipping it back.
 *
 * A code this deployment cannot sync raises rather than answering with nothing, because an
 * empty fan-out and a mistyped flag are the same silent success otherwise.
 */
export function scopeToRequestedProvider<T>(
  providers: ReadonlyMap<ProviderKey, T>,
  argv: readonly string[],
): Map<ProviderKey, T> {
  const at = argv.indexOf("--provider");
  if (at === -1) return new Map(providers);

  const requested = argv[at + 1];
  if (requested === undefined || requested.startsWith("--")) {
    throw new Error("--provider needs a code, e.g. --provider booking_manager");
  }

  const parsed = providerKeySchema.safeParse(requested);
  if (!parsed.success) {
    throw new Error(
      `Unknown provider "${requested}"; expected one of ${providerKeySchema.options.join(", ")}`,
    );
  }

  const only = providers.get(parsed.data);
  if (!only) {
    throw new Error(
      `Provider "${requested}" is not one this deployment can sync: its row is disabled, its ` +
        "credentials are missing, or it is the mock, which is never imported",
    );
  }

  return new Map([[parsed.data, only]]);
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
