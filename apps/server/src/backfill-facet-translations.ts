/**
 * Fills the catalogue's facet and extra labels from provider payloads already stored, so a
 * language added after an import gets the names its vendor had been sending all along.
 *
 * No vendor call: it replays `provider_raw_payload`, which makes it safe to run against
 * production during a sync. Run it after `apply-translations`, so a real vendor label takes
 * over from a generated one where the vendor has it.
 *
 * A dry run by default; pass `--apply` to write, and `--provider <code>` to limit it to one.
 */
import { db } from "@yacht-charter/db";
import { backfillFacetTranslations } from "@yacht-charter/providers/backfill-facets";

const at = process.argv.indexOf("--provider");

await backfillFacetTranslations({
  apply: process.argv.includes("--apply"),
  only: at === -1 ? undefined : process.argv[at + 1],
});

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
