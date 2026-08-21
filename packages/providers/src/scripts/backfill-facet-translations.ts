/**
 * Fills `facet_media_translation` from provider payloads already on disk.
 *
 * The catalogue sync writes these on every run from now on, but the labels it writes have
 * been arriving since the first import and getting dropped in the projection, so every
 * fleet imported before that change carries none. This replays the projection against
 * stored `provider_raw_payload` rows and writes only the facet translations.
 *
 * No vendor call, so it is safe to run against production during a sync: it reads
 * `provider_record`, writes `facet_media` and `facet_media_translation`, and touches
 * nothing else. Listings, prices and availability are all out of its reach.
 *
 *   pnpm --filter @yacht-charter/providers facets:backfill
 *   pnpm --filter @yacht-charter/providers facets:backfill -- --apply
 *   pnpm --filter @yacht-charter/providers facets:backfill -- --provider nausys --apply
 */
import { db } from "@yacht-charter/db";
import { provider as providerTable } from "@yacht-charter/db/schema/provider";
import { createInventoryProvider } from "../registry";
import {
  facetLabels,
  loadProviderRecordSet,
  writeFacetTranslations,
} from "../sync/catalogue-writer";
import { revalidateCatalogCache } from "../sync/revalidate";
import { providerKeySchema } from "../types";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const apply = argv.includes("--apply");
const only = flag("provider");

async function main(): Promise<void> {
  const rows = await db
    .select({ id: providerTable.id, code: providerTable.code })
    .from(providerTable);

  const targets = only ? rows.filter((row) => row.code === providerKeySchema.parse(only)) : rows;
  if (targets.length === 0) throw new Error(`No provider row with code "${only}"`);

  let written = 0;

  for (const target of targets) {
    const providerKey = providerKeySchema.safeParse(target.code);
    /* `provider` is a data table and a code nobody implements is a row, not a crash. */
    if (!providerKey.success) {
      console.log(`${target.code}: no adapter, skipped`);
      continue;
    }

    const records = await loadProviderRecordSet(db, target.id);
    const catalogue = createInventoryProvider({ db }, providerKey.data).projectCatalogue(records);
    const labels = facetLabels(catalogue);

    const perKind = new Map<string, number>();
    const perLocale = new Map<string, number>();
    for (const label of labels) {
      perKind.set(label.kind, (perKind.get(label.kind) ?? 0) + 1);
      for (const locale of Object.keys(label.translations)) {
        perLocale.set(locale, (perLocale.get(locale) ?? 0) + 1);
      }
    }

    const summarise = (counts: Map<string, number>) =>
      [...counts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key} ${count}`)
        .join(", ") || "none";

    console.log(`${target.code}: ${labels.length} facets — ${summarise(perKind)}`);
    console.log(`${target.code}: labels by locale — ${summarise(perLocale)}`);

    if (apply) written += await writeFacetTranslations(db, catalogue);
  }

  if (!apply) {
    console.log("\nDry run. Pass --apply to write.");
    await db.$client.end();
    return;
  }

  console.log(`\nWrote ${written} label rows.`);
  /* Facet labels are swapped at read time, so the search documents are already correct;
     it is only the web app's cached catalog reads that still hold the English copy. */
  const revalidated = await revalidateCatalogCache();
  if (!revalidated.ok) console.log(`Catalog cache not revalidated: ${revalidated.reason}`);

  await db.$client.end();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await db.$client.end();
  process.exit(1);
});
