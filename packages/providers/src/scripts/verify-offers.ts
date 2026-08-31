/**
 * Checks the invariants the offer model rests on, and prints what breaks them.
 *
 * There is no database harness in this repo, so the pure decisions are unit-tested and the
 * shape of the data is checked here instead. Run it after the backfill, after the
 * re-projection, and after any merge or split:
 *
 *   pnpm --filter @yacht-charter/providers offers:verify
 *
 * Every check is phrased so that zero is the healthy answer. Exits non-zero when anything is
 * broken, so it can gate a deploy.
 */
import { db } from "@yacht-charter/db";
import { sql } from "drizzle-orm";

type Check = { name: string; detail: string; query: ReturnType<typeof sql> };

const CHECKS: Check[] = [
  {
    name: "sources without an offer",
    detail: "every attached listing_source is one offer; a missing one is inventory nobody sells",
    query: sql`
      select count(*)::int as count
      from listing_source ls
      left join listing_offer o on o.listing_source_id = ls.id
      where ls.listing_id is not null and o.id is null`,
  },
  {
    name: "offers on a different listing than their source",
    detail: "the two must move together, or a merge leaves the offer pointing at the old listing",
    query: sql`
      select count(*)::int as count
      from listing_offer o
      join listing_source ls on ls.id = o.listing_source_id
      where ls.listing_id is distinct from o.listing_id`,
  },
  {
    name: "listings with two active offers from one provider",
    detail: "one vendor bidding against itself; this is what the fused-listing split repaired",
    query: sql`
      select count(*)::int as count from (
        select listing_id, provider_id
        from listing_offer where status = 'active'
        group by listing_id, provider_id having count(*) > 1
      ) doubled`,
  },
  {
    name: "child rows whose listing disagrees with their offer's",
    detail: "denormalised listing_id must follow the offer, or search reads one and quotes another",
    query: sql`
      select (
        (select count(*) from availability_slot t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_price_period t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_free_period t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_refused_period t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_media t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from provider_extra_catalogue t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_text t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_amenity t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_checkin_rule t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
        + (select count(*) from listing_one_way_rule t join listing_offer o on o.id = t.listing_offer_id where o.listing_id <> t.listing_id)
      )::int as count`,
  },
  {
    name: "published listings with no active offer",
    detail: "a card customers can open and nobody can sell",
    query: sql`
      select count(*)::int as count
      from listing l
      where l.status = 'published'
        and not exists (select 1 from listing_offer o where o.listing_id = l.id and o.status = 'active')`,
  },
  {
    name: "offers whose provider disagrees with their source's",
    detail: "the denormalised provider_id is what the one-per-vendor rule is enforced on",
    query: sql`
      select count(*)::int as count
      from listing_offer o
      join listing_source ls on ls.id = o.listing_source_id
      join provider_record pr on pr.id = ls.provider_record_id
      where pr.provider_id <> o.provider_id`,
  },
  {
    name: "quotes and bookings pointing at another listing's offer",
    detail: "the vendor a sale was made with must be one this listing actually has",
    query: sql`
      select (
        (select count(*) from quote q join listing_offer o on o.id = q.listing_offer_id where o.listing_id <> q.listing_id)
        + (select count(*) from booking b join listing_offer o on o.id = b.listing_offer_id where o.listing_id <> b.listing_id)
      )::int as count`,
  },
  {
    name: "merged listings still holding an offer",
    detail: "a listing is only merged once its offers have left; otherwise the inventory is hidden",
    query: sql`
      select count(*)::int as count
      from listing l
      where l.status = 'merged'
        and exists (select 1 from listing_offer o where o.listing_id = l.id)`,
  },
];

/** Rows still carrying no offer, which migration B is about to forbid. */
const UNATTRIBUTED = [
  "availability_slot",
  "listing_price_period",
  "listing_free_period",
  "listing_refused_period",
  "listing_media",
  "provider_extra_catalogue",
  "listing_text",
  "listing_amenity",
  "listing_checkin_rule",
  "listing_one_way_rule",
];

async function main(): Promise<void> {
  let broken = 0;

  for (const check of CHECKS) {
    const result = await db.execute<{ count: number }>(check.query);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count === 0) {
      console.log(`  ok    ${check.name}`);
      continue;
    }
    broken += 1;
    console.log(`  FAIL  ${check.name}: ${count}`);
    console.log(`        ${check.detail}`);
  }

  console.log("\nRows with no offer yet:");
  let unattributed = 0;
  for (const table of UNATTRIBUTED) {
    const result = await db.execute<{ count: number }>(
      sql.raw(`select count(*)::int as count from ${table} where listing_offer_id is null`),
    );
    const count = Number(result.rows[0]?.count ?? 0);
    unattributed += count;
    if (count > 0) console.log(`  ${table}: ${count}`);
  }
  if (unattributed === 0) console.log("  none");

  console.log(broken === 0 ? "\nEvery invariant holds." : `\n${broken} invariant(s) broken.`);
  process.exit(broken === 0 ? 0 : 1);
}

/* A catch binding rather than a handler parameter, so nothing has to accept an `unknown`. */
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
