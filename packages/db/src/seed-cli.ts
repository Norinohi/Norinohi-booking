/**
 * The `pnpm db:seed` entry point. `seed.ts` itself is side-effect-free (it only
 * exports `main` and `insertFacetMedia`) precisely so it can be imported without
 * also running a CLI and calling process.exit() as a side effect — as
 * apps/server/src/seed-facets.ts does, to reuse insertFacetMedia from a compiled
 * ops script. This file is the one place that actually triggers the run.
 */
import { insertFacetMedia, main } from "./seed";

const args = new Set(process.argv.slice(2));

async function run(): Promise<void> {
  // For a database whose catalogue came from a provider sync rather than this
  // file's mock data (a real environment, not local dev) — seeds only the
  // editorial facet images/descriptions, none of the mock provider/listing data.
  if (args.has("--facets-only")) {
    const result = await insertFacetMedia();
    console.log(
      `Seeded ${result.facetsSeeded} facet media entries and ${result.translationsSeeded} translations.`,
    );
    return;
  }
  await main();
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
