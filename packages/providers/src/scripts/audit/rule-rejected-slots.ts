/**
 * Charters a vendor priced and called free, which our copy of its check-in rules refuses.
 *
 * The projection only advertises a confirmed slot that a rule in force admits
 * (`sellableConfirmedSlot` in packages/db/src/search/read-model.ts), so every row here is a
 * charter the vendor would sell and the catalogue hides. Grouped by which part of the rule
 * fails, which says whether the rule copy is stale, mis-read, or right to refuse.
 *
 * Reads the local database only.
 *
 *   pnpm --filter @yacht-charter/providers audit:rule-rejects
 */
import { db } from "@yacht-charter/db";
import { MIN_LEAD_DAYS } from "@yacht-charter/db/search/read-model";
import { sql } from "drizzle-orm";

const SAMPLES_PER_REASON = 5;

type Row = {
  provider: string;
  reason: string;
  slots: number;
  listings: number;
  samples: string[];
};

async function main(): Promise<void> {
  const { rows } = await db.execute<Row>(sql`
    with slot as (
      select s.listing_offer_id, s.start_date, s.end_date, o.listing_id, p.code as provider
      from availability_slot s
      join listing_offer o on o.id = s.listing_offer_id and o.status = 'active'
      join provider p on p.id = o.provider_id
      where s.availability_confirmed
        and s.status = 'available'
        and s.price_minor is not null
        and s.start_date >= current_date + ${MIN_LEAD_DAYS}::int
        and not exists (
          select 1 from availability_slot t
          where t.listing_offer_id = s.listing_offer_id and t.status <> 'available'
            and t.start_date < s.end_date and t.end_date > s.start_date
        )
        and exists (select 1 from listing_checkin_rule c where c.listing_offer_id = s.listing_offer_id)
        and not exists (
          select 1 from listing_checkin_rule c
          where c.listing_offer_id = s.listing_offer_id
            and (c.season_start is null or s.start_date >= c.season_start)
            and (c.season_end is null or s.start_date <= c.season_end)
            and (c.checkin_weekday is null or extract(dow from s.start_date)::int = c.checkin_weekday)
            and (c.checkout_weekday is null or extract(dow from s.end_date)::int = c.checkout_weekday)
            and (c.min_nights is null or s.end_date - s.start_date >= c.min_nights)
            and (c.max_nights is null or s.end_date - s.start_date <= c.max_nights)
        )
    ),
    /* The nearest miss: the rule in season that fails on the fewest counts, and on what. */
    diagnosed as (
      select
        slot.*,
        (
          select case
            when not (c.season_start is null or slot.start_date >= c.season_start)
              or not (c.season_end is null or slot.start_date <= c.season_end)
              then 'no rule in season on the check-in day'
            when not (c.checkin_weekday is null or extract(dow from slot.start_date)::int = c.checkin_weekday)
              then 'check-in weekday differs'
            when not (c.checkout_weekday is null or extract(dow from slot.end_date)::int = c.checkout_weekday)
              then 'check-out weekday differs (NauSYS end-date convention?)'
            when not (c.min_nights is null or slot.end_date - slot.start_date >= c.min_nights)
              then 'shorter than the minimum stay'
            else 'longer than the maximum stay'
          end
          from listing_checkin_rule c
          where c.listing_offer_id = slot.listing_offer_id
          order by
            (not (c.season_start is null or slot.start_date >= c.season_start)
              or not (c.season_end is null or slot.start_date <= c.season_end))::int
            + (not (c.checkin_weekday is null or extract(dow from slot.start_date)::int = c.checkin_weekday))::int
            + (not (c.checkout_weekday is null or extract(dow from slot.end_date)::int = c.checkout_weekday))::int
            + (not (c.min_nights is null or slot.end_date - slot.start_date >= c.min_nights))::int
            + (not (c.max_nights is null or slot.end_date - slot.start_date <= c.max_nights))::int
          limit 1
        ) as reason
      from slot
    )
    select
      provider,
      reason,
      count(*)::int as slots,
      count(distinct listing_id)::int as listings,
      (array_agg(distinct listing_id))[1:${SAMPLES_PER_REASON}] as samples
    from diagnosed
    group by provider, reason
    order by provider, slots desc
  `);

  console.log("Confirmed, priced, free charters our rule copy refuses:\n");
  for (const row of rows) {
    console.log(
      `${row.provider.padEnd(16)} ${String(row.slots).padStart(6)} slots ${String(row.listings).padStart(5)} listings  ${row.reason}`,
    );
    console.log(`${" ".repeat(17)}e.g. ${row.samples.join(", ")}`);
  }
  if (rows.length === 0) console.log("none");
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
