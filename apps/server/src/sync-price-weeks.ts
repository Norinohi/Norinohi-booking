/**
 * The nightly price-weeks job: asks every enabled vendor to price each Saturday week of the next
 * PRICE_WEEKS_COUNT weeks for the whole fleet, writes the answers through the availability
 * writer and rebuilds the read model for the listings it touched. See docs/scheduled-jobs.md.
 *
 * Budgeted and resumable. It stops at PRICE_WEEKS_BUDGET_MS from process start and the next
 * night continues from the first week it did not finish.
 *
 *   pnpm --filter server sync:price-weeks
 *   PRICE_WEEKS_COUNT=2 pnpm --filter server sync:price-weeks -- --provider nausys
 */
import { db } from "@yacht-charter/db";
import { env } from "@yacht-charter/env/server";
import {
  createEnabledInventoryProviders,
  scopeToRequestedProvider,
  type InventoryProvider,
  type ProviderKey,
} from "@yacht-charter/providers";
import { type PriceWeeksProvider, supportsPriceWeeks } from "@yacht-charter/providers/provider";
import { leadDaysFor, saturdayWeeks } from "@yacht-charter/providers/shared/price-weeks";
import {
  openPriceWeeksRun,
  readPriceWeeksCursor,
  runPriceWeeksJob,
} from "@yacht-charter/providers/sync/price-weeks";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import { SyncAlreadyRunningError } from "@yacht-charter/providers/sync/run";
import { ensureProviderId } from "@yacht-charter/providers/sync/runner";
import { startJob } from "./job";

const job = startJob("sync-price-weeks");
const startedAt = Date.now();
const deadline = startedAt + env.PRICE_WEEKS_BUDGET_MS;

/* Past this the night is mostly spent, and a run opened with minutes left prices a week or two. */
const LOCK_WAIT_MS = 20 * 60 * 1000;
const LOCK_POLL_MS = 30_000;

let providers: Map<ProviderKey, InventoryProvider>;
try {
  providers = scopeToRequestedProvider(
    await createEnabledInventoryProviders({ db }),
    process.argv.slice(2),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await db.$client.end();
  await job.failed(error instanceof Error ? error.message : "could not resolve providers");
  process.exit(1);
}

const priced = [...providers.values()].filter(supportsPriceWeeks);
if (priced.length === 0) {
  console.error("No enabled provider can price weeks; nothing to do");
  await db.$client.end();
  await job.failed("no provider supports price weeks");
  process.exit(1);
}

let failed = 0;
let skipped = 0;
let confirmedSlots = 0;
let refusedPeriods = 0;
let budgetStopped = 0;

const today = new Date(startedAt).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const priceProvider = async (provider: InventoryProvider & PriceWeeksProvider) => {
  const providerId = await ensureProviderId(db, provider.key);
  const weeks = saturdayWeeks({
    today,
    leadDays: leadDaysFor(provider.key),
    count: env.PRICE_WEEKS_COUNT,
  });

  let syncRunId: string;
  try {
    syncRunId = await openPriceWeeksRun(db, providerId, {
      until: Math.min(startedAt + LOCK_WAIT_MS, deadline),
      pollMs: LOCK_POLL_MS,
      now: Date.now,
      sleep,
    });
  } catch (error) {
    if (!(error instanceof SyncAlreadyRunningError)) {
      failed += 1;
      console.error(`Could not open price-weeks for "${provider.key}":`, error);
      return;
    }
    /* An availability run held the lock for the whole wait. Not a failure: the next night
       resumes from the same cursor. */
    skipped += 1;
    console.warn(`Skipped "${provider.key}": ${error instanceof Error ? error.message : error}`);
    return;
  }

  const resume = await readPriceWeeksCursor(db, providerId);
  const budgetMs = Math.max(0, deadline - Date.now());
  console.log(
    `Started price-weeks ${syncRunId} for "${provider.key}": ${weeks[0]?.startDate} to ` +
      `${weeks.at(-1)?.endDate}, resuming from ${JSON.stringify(resume)}, budget ${Math.round(budgetMs / 1000)}s`,
  );

  try {
    const result = await runPriceWeeksJob({
      db,
      provider,
      providerId,
      syncRunId,
      weeks,
      resume,
      budgetMs,
      onWeek: (week) =>
        console.log(
          `[${provider.key}] ${week.startDate}..${week.endDate} offers ${week.offers} ` +
            `fetch ${(week.fetchMs / 1000).toFixed(1)}s write ${(week.writeMs / 1000).toFixed(1)}s`,
        ),
    });
    for (const line of JSON.stringify(result, null, 2).split("\n")) {
      console.log(`[${provider.key}] ${line}`);
    }
    console.log(
      `Price-weeks ${syncRunId} finished for "${provider.key}" in ` +
        `${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
    confirmedSlots += result.confirmedSlots;
    refusedPeriods += result.refusedPeriods;
    if (result.budgetExhausted) budgetStopped += 1;
    if (result.status === "failed") failed += 1;
  } catch (error) {
    failed += 1;
    console.error(`Price-weeks failed for "${provider.key}":`, error);
  }
};

await Promise.all(priced.map(priceProvider));

await revalidateCatalogCache();

// See sync-catalogue.ts: an idle pool client keeps the process alive.
await db.$client.end();

const metrics = {
  providers: priced.length,
  weeks: env.PRICE_WEEKS_COUNT,
  failed,
  skipped,
  budgetStopped,
  confirmedSlots,
  refusedPeriods,
};
if (failed > 0) {
  await job.failed(`${failed} provider price-weeks run(s) failed`, metrics);
  process.exit(1);
}

await job.done(metrics);
