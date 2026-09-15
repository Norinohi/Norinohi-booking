/**
 * Seeds the client's popular sailing routes into /routes, run by hand from the deployed container
 * -- same pattern as seed-facets.ts and rebuild-search-docs.ts.
 *
 * A dry run by default: it prints what it would create and which featured routes the new order
 * would drop, and writes nothing until `--apply` is passed. Safe to repeat: a route that already
 * exists is never touched, so a re-run only puts the featured order back. `--refresh-copy` is the
 * exception: it rewrites existing routes' title and description in every locale from the seed.
 */
import { db } from "@yacht-charter/db";
import { seedPopularRoutes } from "@yacht-charter/db/popular-routes-seed";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const apply = process.argv.includes("--apply");
const refreshCopy = process.argv.includes("--refresh-copy");
const plan = await seedPopularRoutes(db, { apply, refreshCopy });

for (const route of plan.created) {
  console.log(`${apply ? "created" : "would create"}  ${route.title}  (${route.target})`);
}
for (const route of plan.existing) console.log(`exists        ${route.title}`);
for (const route of plan.refreshed) {
  console.log(`${apply ? "copy updated" : "would update copy"}  ${route.title}`);
}
for (const route of plan.unresolved) {
  console.log(`SKIPPED       ${route.title}: no ${route.target} in this database`);
}
for (const route of plan.unfeatured) {
  console.log(`${apply ? "unfeatured" : "would unfeature"}  ${route.title} (${route.id})`);
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
