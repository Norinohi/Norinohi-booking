/**
 * Pulls the ECB daily reference rates into `fx_rate`, run by hand — same pattern as
 * publish-listings.ts and rebuild-search-docs.ts. The nightly path is not this: sync-catalogue.ts
 * refreshes them itself, ahead of the projection rebuild that reads them.
 *
 * Reach for it when seeding a fresh database, or after a stretch where the nightly sync did not
 * run. Nothing is charged against these rates. They exist so the catalogue can compare listings
 * that providers publish in different currencies: `listing_search_doc.price_from_minor_eur` is
 * written from them, and the price sort, the price filter and every "from" aggregate read that
 * column rather than the published one.
 *
 * Storing a rate does not reprice anything on its own — the column is written by the projection.
 * Follow this with `pnpm --filter server rebuild:search-docs` when the fleet needs to catch up.
 */
import { db } from "@yacht-charter/db";
import { refreshFxRates } from "@yacht-charter/db/fx/rates";

const result = await refreshFxRates(db);

console.log(`Stored ${result.currencies} reference rates published ${result.asOf}`);

// An idle pool client holds the event loop open. See apps/server/AGENTS.md.
await db.$client.end();
