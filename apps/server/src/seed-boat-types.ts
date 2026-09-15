/**
 * Seeds the boat-type cards' copy in every locale, run by hand from the deployed container -- same
 * pattern as seed-popular-routes.ts.
 *
 * A dry run by default: it prints which types it would create, update or leave alone, and writes
 * nothing until `--apply` is passed. Safe to repeat: it only ever writes the seed's copy.
 */
import { db } from "@yacht-charter/db";
import { seedBoatTypes } from "@yacht-charter/db/boat-types-seed";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const apply = process.argv.includes("--apply");
const plan = await seedBoatTypes(db, { apply });

for (const value of plan.created) console.log(`${apply ? "created" : "would create"}  ${value}`);
for (const value of plan.updated) console.log(`${apply ? "updated" : "would update"}  ${value}`);
for (const value of plan.unchanged) console.log(`unchanged     ${value}`);

if (apply) {
  /* Facets are cached for days; without this the new copy would look like it never landed. */
  const cache = await revalidateCatalogCache();
  console.log(`cache: ${cache.ok ? "dropped" : `not dropped (${cache.reason ?? "unknown"})`}`);
} else {
  console.log("\nDry run. Re-run with --apply to write.");
}

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
