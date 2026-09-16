/**
 * Seeds the client's full sailing-route list into /routes, run by hand from the deployed container
 * -- same pattern as seed-popular-routes.ts.
 *
 * A dry run by default: it prints which routes it would create, which marina each one would hang
 * off, and which of the featured twelve would have their stops replaced. Writes nothing until
 * `--apply` is passed. Safe to repeat: a route that already exists is never touched.
 */
import { db } from "@yacht-charter/db";
import { seedCatalogueRoutes } from "@yacht-charter/db/catalogue-routes-seed";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const apply = process.argv.includes("--apply");
const plan = await seedCatalogueRoutes(db, { apply });

for (const route of plan.created) {
  console.log(`${apply ? "created" : "would create"}  ${route.title}  (${route.target})`);
}
for (const route of plan.existing) console.log(`exists        ${route.title}`);
for (const route of plan.unresolved) {
  console.log(
    `SKIPPED       ${route.title}: no charter base near the start, and no fallback region`,
  );
}
for (const entry of plan.stopsRefreshed) {
  console.log(`${apply ? "stops" : "would set stops"}  ${entry.routeId} (${entry.stops})`);
}
for (const id of plan.missingRefreshTargets) {
  console.log(`no such route ${id}: run seed:routes first`);
}

if (apply) {
  /* The home page caches its routes for hours; without this the seed would look like it failed. */
  const cache = await revalidateCatalogCache();
  console.log(`cache: ${cache.ok ? "dropped" : `not dropped (${cache.reason ?? "unknown"})`}`);
} else {
  console.log("\nDry run. Re-run with --apply to write.");
}

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
