/**
 * The `facets:backfill` entry point. `backfill-facets.ts` only exports, so the server can import
 * it into a compiled ops script without a CLI running as a side effect.
 *
 *   pnpm --filter @yacht-charter/providers facets:backfill
 *   pnpm --filter @yacht-charter/providers facets:backfill -- --apply
 *   pnpm --filter @yacht-charter/providers facets:backfill -- --provider nausys --apply
 */
import { db } from "@yacht-charter/db";

import { backfillFacetTranslations } from "../backfill-facets";

const argv = process.argv.slice(2);
const at = argv.indexOf("--provider");

backfillFacetTranslations({
  apply: argv.includes("--apply"),
  only: at === -1 ? undefined : argv[at + 1],
})
  .then(() => db.$client.end())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$client.end();
    process.exit(1);
  });
