/**
 * Asks NauSYS to price one exact charter for one hull, and writes the answer through the
 * ordinary availability writer. Run by hand from the deployed container.
 *
 * The scheduled sweep reaches every advertised period on its own rotation — sixty of them each
 * run plus a rotating slice of the tail, so the whole NauSYS tail takes about sixteen hourly
 * runs (`ADVERTISED_TAIL_PER_RUN` in packages/providers/src/shared/sweep-periods.ts). This is
 * that same confirming pass with its scope narrowed to a single call, for the two cases the
 * rotation serves badly: checking the pipeline end to end without waiting out a cycle, and
 * pricing one card somebody is looking at now.
 *
 * It is the confirming pass alone. The occupancy walk in front of it is 490 companies times two
 * years of vendor calls and has nothing to say about one period already known to be free, so
 * `listScopes` is emptied rather than walked.
 *
 * NauSYS only. Its provider takes a `hotWindows` override for exactly this; the Booking Manager
 * source reads its periods from the read model with no injection point, so asking for one there
 * would mean widening that provider's surface for a hand tool.
 *
 *   pnpm --filter server confirm:period -- 2026-09-21 2026-09-22 28481585
 */
import { db } from "@yacht-charter/db";
import { NausysInventoryProvider } from "@yacht-charter/providers/nausys/provider";
import {
  createDrizzleAvailabilitySyncStore,
  openAvailabilitySyncRun,
  runAvailabilitySync,
} from "@yacht-charter/providers/sync/availability-writer";
import { ensureProviderId } from "@yacht-charter/providers/sync/runner";

/**
 * Its own cursor row, never the sweep's.
 *
 * The store defaults to `HOT_WINDOW_CURSOR_SCOPE`, which is where the scheduled pass keeps the
 * position its grid resumes from — and this walk completes every time, so it would clear that
 * position on every use and send the next scheduled run back to the first grid window.
 */
const CURSOR_SCOPE = "occupancy:hot:one-off";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const [periodFrom, periodTo, yachtId] = process.argv.slice(2);

if (!periodFrom || !periodTo || !yachtId) {
  console.error(
    "usage: confirm:period -- <periodFrom> <periodTo> <externalYachtId>\n" +
      "  e.g. pnpm --filter server confirm:period -- 2026-09-21 2026-09-22 28481585",
  );
  process.exit(1);
}

if (!ISO_DAY.test(periodFrom) || !ISO_DAY.test(periodTo)) {
  console.error(`Both dates must be yyyy-mm-dd; got "${periodFrom}" and "${periodTo}"`);
  process.exit(1);
}

if (periodTo <= periodFrom) {
  console.error(`The charter must end after it starts; got ${periodFrom} to ${periodTo}`);
  process.exit(1);
}

const provider = new NausysInventoryProvider({
  db,
  hotWindows: [{ periodFrom, periodTo, yachtIds: [yachtId] }],
});
const providerId = await ensureProviderId(db, provider.key);

let syncRunId: string;
try {
  syncRunId = await openAvailabilitySyncRun(db, providerId);
} catch (error) {
  /* The lock an availability sync holds per provider. Not a failure of this tool: an hourly
     run is walking the same vendor, and it will price this period on its own rotation. */
  console.error(
    `A NauSYS availability sync is already running; try again when it finishes. ` +
      `(${error instanceof Error ? error.message : error})`,
  );
  await db.$client.end();
  process.exit(1);
}

try {
  const source = provider.createAvailabilitySource({});
  const result = await runAvailabilitySync({
    store: createDrizzleAvailabilitySyncStore({
      db,
      providerId,
      syncRunId,
      cursorScope: CURSOR_SCOPE,
    }),
    source: { ...source, listScopes: () => Promise.resolve([]) },
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    result.confirmedSlots > 0
      ? `\nNauSYS priced ${periodFrom} to ${periodTo} for yacht ${yachtId}; ` +
          `${result.listingsTouched} listing(s) rebuilt.`
      : `\nNauSYS returned no price for ${periodFrom} to ${periodTo} on yacht ${yachtId}. ` +
          `That is an answer: the vendor declines to sell that charter.`,
  );
} catch (error) {
  console.error(`Could not confirm ${periodFrom} to ${periodTo} for yacht ${yachtId}:`, error);
  await db.$client.end();
  process.exit(1);
}

// See sync-catalogue.ts: an idle pool client holds the event loop open.
await db.$client.end();
