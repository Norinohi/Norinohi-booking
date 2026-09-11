import { db } from "@yacht-charter/db";
import { cleanupEnabledProviderMediaAssets } from "@yacht-charter/providers/sync/media-assets";

import { startJob } from "./job";

const job = startJob("sync-media-cleanup");

const metrics = await cleanupEnabledProviderMediaAssets(db);
const jobMetrics = { ...metrics };

await db.$client.end();

if (metrics.failed > 0) {
  await job.failed(`${metrics.failed} media cleanup item(s) failed`, jobMetrics);
  process.exit(1);
}

await job.done(jobMetrics);
