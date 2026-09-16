/**
 * Vendor yachts we hold a record of, and how far each got towards the catalogue.
 *
 * The availability sweep skips every offer whose hull it cannot resolve to a listing, and a run
 * reports tens of thousands of those. Some are companies deliberately out of scope; the rest are
 * boats the vendor sells that no search can find. This splits the records we do hold by the step
 * they stopped at, per company, so an out-of-scope operator and a broken import read differently.
 *
 * Reads the local database only.
 *
 *   pnpm --filter @yacht-charter/providers audit:coverage
 */
import { db } from "@yacht-charter/db";
import { sql } from "drizzle-orm";

const TOP_COMPANIES = 15;

type StageRow = { provider: string; stage: string; yachts: number };
type CompanyRow = { provider: string; company: string | null; yachts: number };

async function main(): Promise<void> {
  const stage = sql`
    case
      when not r.active then '1 record inactive (retired by the vendor or out of scope)'
      when ls.id is null then '2 active record, no listing source'
      when ls.listing_id is null then '3 source not attached to a listing'
      when l.status <> 'published' then '4 listing not published (' || l.status || ')'
      when not exists (
        select 1 from listing_offer o where o.listing_source_id = ls.id and o.status = 'active'
      ) then '5 no active offer'
      when not exists (select 1 from listing_search_doc d where d.listing_id = l.id)
        then '6 published but no search document'
      else '7 searchable'
    end`;
  const from = sql`
    from provider_record r
    join provider p on p.id = r.provider_id
    left join listing_source ls on ls.provider_record_id = r.id
    left join listing l on l.id = ls.listing_id
    where r.resource_type = 'yacht'`;

  const stages = await db.execute<StageRow>(sql`
    select p.code as provider, ${stage} as stage, count(distinct r.id)::int as yachts
    ${from}
    group by 1, 2
    order by 1, 2
  `);
  console.log("Vendor yacht records by how far they reached:\n");
  for (const row of stages.rows) {
    console.log(`${row.provider.padEnd(16)} ${String(row.yachts).padStart(6)}  ${row.stage}`);
  }

  const companies = await db.execute<CompanyRow>(sql`
    select p.code as provider, ls.external_company_id as company, count(distinct r.id)::int as yachts
    ${from}
      and ${stage} <> '7 searchable'
    group by 1, 2
    order by 3 desc
    limit ${TOP_COMPANIES}
  `);
  console.log(`\nCompanies holding the most unsearchable yachts (top ${TOP_COMPANIES}):\n`);
  for (const row of companies.rows) {
    console.log(
      `${row.provider.padEnd(16)} ${String(row.yachts).padStart(6)}  company ${row.company ?? "(unknown)"}`,
    );
  }
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
