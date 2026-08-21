/**
 * Imports one Booking Manager yacht by its vendor id, and nothing else.
 *
 * For working on a single boat locally without paying for - or being scoped by -
 * a full catalogue run. `import:booking-manager` walks every company the
 * credential can see and retires the ones outside `BOOKING_MANAGER_COMPANY_IDS`,
 * which makes it the wrong tool for pulling in one boat that belongs to some other
 * company: it would withdraw the fleet already sitting in the database.
 *
 * So this emits no `scope-complete` for any global resource type and none for
 * companies at all. Nothing is swept, nothing is retired, and the yacht's own
 * company row is added beside whatever is already there rather than replacing it.
 * The cursor lives under its own scope for the same reason - a one-boat run must
 * not tell the next full sync that it has already walked the catalogue.
 *
 * Reference data (countries, regions, sailing areas, bases, shipyards, equipment)
 * is NOT fetched: the projection reads it from the records a previous full import
 * left behind. On a database that has never synced Booking Manager, run
 * `import:booking-manager` once first.
 *
 *   pnpm --filter @yacht-charter/providers import:booking-manager-yacht -- <yachtId> [--publish] [--availability]
 */
import { db } from "@yacht-charter/db";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord, syncRun } from "@yacht-charter/db/schema/provider";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { BookingManagerClient } from "../booking-manager/client";
import { resolveBookingManagerConfig } from "../booking-manager/config";
import {
  bookingManagerEndpoints,
  restCompanyListSchema,
  restYachtListSchema,
} from "../booking-manager/endpoints";
import type { BookingManagerProviderOptions } from "../booking-manager/provider";
import { BookingManagerInventoryProvider } from "../booking-manager/provider";
import { createCompanyScope } from "../shared/company-scope";
import { NotFoundError } from "../shared/errors";
import { idOf } from "../shared/projection-helpers";
import { runAvailabilitySyncJob } from "../sync/availability-writer";
import { revalidateCatalogCache } from "../sync/revalidate";
import type { CatalogueSyncSource } from "../sync/runner";
import { ensureProviderId, openCatalogueSyncRun, runCatalogueSyncJob } from "../sync/runner";

const argv = process.argv.slice(2);
const yachtId = argv.find((arg) => !arg.startsWith("--"));
const publish = argv.includes("--publish");

/** The yacht row alone, plus the company row its listing hangs off. */
function singleYachtSource(
  client: BookingManagerClient,
  target: { yachtId: string; companyId: string },
): CatalogueSyncSource {
  return async function* source() {
    const companies = await client.get(bookingManagerEndpoints.companies, restCompanyListSchema);
    const company = companies.find((item) => idOf(item.id) === target.companyId);
    if (!company) {
      throw new NotFoundError(`Booking Manager has no company ${target.companyId}`, {
        providerCode: "booking_manager",
      });
    }
    yield {
      type: "entity",
      entity: {
        resourceType: "company",
        externalId: target.companyId,
        payload: company,
      },
    };

    // `inventory=raw` for the same reason the sweep passes it: without it the
    // payload carries no `equipmentRaw`, and the projection has no amenities.
    const yachts = await client.get(bookingManagerEndpoints.yachts, restYachtListSchema, {
      inventory: "raw",
      companyId: target.companyId,
    });
    const yacht = yachts.find((item) => idOf(item.id) === target.yachtId);
    if (!yacht) {
      throw new NotFoundError(`Company ${target.companyId} does not list yacht ${target.yachtId}`, {
        providerCode: "booking_manager",
      });
    }
    yield {
      type: "entity",
      entity: {
        resourceType: "yacht",
        externalId: target.yachtId,
        scopeKey: target.companyId,
        payload: yacht,
      },
    };
  };
}

/** The adapter, with its catalogue stream replaced by the two-row one above. */
class SingleYachtProvider extends BookingManagerInventoryProvider {
  constructor(
    options: BookingManagerProviderOptions,
    private readonly single: CatalogueSyncSource,
  ) {
    super(options);
  }

  override createCatalogueSyncSource(): CatalogueSyncSource {
    return this.single;
  }
}

const yachtCompanySchema = z.object({ companyId: z.union([z.string(), z.number()]) });

async function main(): Promise<void> {
  if (!yachtId) {
    throw new Error(
      "usage: import:booking-manager-yacht -- <yachtId> [--publish] [--availability]",
    );
  }

  const config = resolveBookingManagerConfig();
  const client = new BookingManagerClient({ config });
  console.log(`host ${config.baseUrl}  yacht ${yachtId}`);

  // Asked rather than derived: the company is the only thing `/yachts` can be
  // addressed by, and the vendor's yacht id is not documented to encode it.
  const detail = await client.get(bookingManagerEndpoints.yacht(yachtId), yachtCompanySchema);
  const companyId = idOf(detail.companyId);
  if (!companyId) throw new Error(`yacht ${yachtId} reports no companyId`);
  console.log(`company ${companyId}`);

  const providerId = await ensureProviderId(db, "booking_manager");
  const provider = new SingleYachtProvider(
    // Scoped to this one company so `--availability` sweeps its occupancy rather
    // than the deployment's configured fleet. The catalogue stream ignores the
    // scope entirely - it is replaced below.
    { db, client, config: { ...config, companyScope: createCompanyScope([companyId], []) } },
    singleYachtSource(client, { yachtId, companyId }),
  );

  const syncRunId = await openCatalogueSyncRun(db, providerId);
  console.log(`sync run ${syncRunId} started\n`);

  const started = Date.now();
  const result = await runCatalogueSyncJob({
    db,
    provider,
    providerId,
    syncRunId,
    cursorScope: `yacht:${yachtId}`,
  });
  console.log(`finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));

  const [source] = await db
    .select({ listingId: listingSource.listingId })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .where(
      and(eq(providerRecord.providerId, providerId), eq(listingSource.externalYachtId, yachtId)),
    )
    .limit(1);

  const listingId = source?.listingId ?? null;
  if (!listingId) {
    console.log("\nno listing was written for this yacht; see sync_error for why");
    return;
  }

  const [row] = await db
    .select({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      status: listing.status,
      currency: listing.defaultCurrency,
    })
    .from(listing)
    .where(eq(listing.id, listingId));
  console.table(row ? [row] : []);

  if (argv.includes("--availability")) {
    const [run] = await db
      .insert(syncRun)
      .values({ providerId, kind: "availability", status: "pending" })
      .returning({ id: syncRun.id });
    if (!run) throw new Error("availability sync_run insert returned no row");

    console.log(`\navailability run ${run.id} started`);
    const availStarted = Date.now();
    const summary = await runAvailabilitySyncJob({ db, provider, providerId, syncRunId: run.id });
    console.log(`finished in ${((Date.now() - availStarted) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(summary, null, 2));
  }

  if (publish && row?.status !== "published") {
    await db
      .update(listing)
      .set({ status: "published" })
      .where(inArray(listing.id, [listingId]));
    await rebuildSearchReadModelsAfterSync(db, { listingIds: [listingId] });
    console.log("\npublished");
  }

  const revalidated = await revalidateCatalogCache();
  console.log(
    revalidated.ok
      ? "dropped the cached catalog reads"
      : `cache not revalidated (${revalidated.reason}); it will catch up on its own window`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
