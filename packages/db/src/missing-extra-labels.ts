/**
 * Lists the extra names customers would read in the vendor's English, busiest first.
 *
 * A name counts as translated in a locale when either the provider's own translation of that
 * extra or a curated `extra_label_translation` row reaches it, which is the same pair of joins
 * the listing page and the quote read with. Ranked by how many boats and offers carry the name,
 * so a curation pass into `translations/extra-labels.json` starts where it helps most.
 *
 *   pnpm --filter @yacht-charter/db translations:missing-extras
 *   pnpm --filter @yacht-charter/db translations:missing-extras -- --locale uk --limit 100
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { TRANSLATED_LOCALES } from "./locales";

import { db } from "./index";
import { normalizedKeySql } from "./search/normalize";

const LOCALES = TRANSLATED_LOCALES;

const argsSchema = z.object({
  locale: z.enum(LOCALES).optional(),
  limit: z.coerce.number().int().min(1).max(5_000).default(40),
});

const rowSchema = z.object({
  name: z.string(),
  listings: z.coerce.number(),
  offers: z.coerce.number(),
});

const totalsSchema = z.object({ names: z.coerce.number() });

function readArgs(argv: string[]): z.infer<typeof argsSchema> {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  return argsSchema.parse({ locale: flag("locale"), limit: flag("limit") });
}

async function missingFor(locale: string, limit: number) {
  const untranslated = sql`
    select
      ${normalizedKeySql(sql`extra.name`)} as key,
      min(extra.name) as name,
      count(distinct extra.listing_id) as listings,
      count(distinct extra.listing_offer_id) as offers
    from provider_extra_catalogue extra
    left join provider_extra_translation translation
      on translation.source = extra.source
      and translation.kind = extra.kind
      and translation.external_id = extra.external_id
      and translation.locale = ${locale}
    left join extra_label_translation curated
      on curated.name_key = ${normalizedKeySql(sql`extra.name`)}
      and curated.locale = ${locale}
    where translation.label is null and curated.label is null
    group by 1
  `;

  const [rows, totals] = await Promise.all([
    db.execute(sql`
      select name, listings, offers from (${untranslated}) missing
      order by listings desc, offers desc, name
      limit ${limit}
    `),
    db.execute(sql`
      select count(*) as names from (${untranslated}) missing
    `),
  ]);

  return { rows: z.array(rowSchema).parse(rows.rows), totals: totalsSchema.parse(totals.rows[0]) };
}

async function main(): Promise<void> {
  const { locale, limit } = readArgs(process.argv.slice(2));

  for (const current of locale ? [locale] : LOCALES) {
    const { rows, totals } = await missingFor(current, limit);
    console.log(`\n${current}: ${totals.names} untranslated names\n`);
    console.log("boats\toffers\tname");
    for (const row of rows) console.log(`${row.listings}\t${row.offers}\t${row.name}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  await db.$client.end();
  process.exit(1);
}

await db.$client.end();
