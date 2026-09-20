/**
 * Writes the checked-in label sets into the translation tables, from the deployed container.
 *
 * `pnpm --filter @yacht-charter/db translations:apply` does the same thing but needs `tsx`,
 * which a production container does not have. Same pattern as seed-facets.ts.
 *
 * A dry run by default; pass `--apply` to write.
 */
import { db } from "@yacht-charter/db";
import { applyTranslations } from "@yacht-charter/db/apply-translations";

await applyTranslations({ apply: process.argv.includes("--apply") });

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
