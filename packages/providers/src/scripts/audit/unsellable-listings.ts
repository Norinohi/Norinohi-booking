/**
 * Why published listings advertise no charter at all.
 *
 * A search document with no `bookable_from` is a boat no dated or length filter can find, so a
 * large share of them is the first place "search does not find everything" would come from. Each
 * listing is given the first reason, in the order below, that its own offers explain, so the
 * counts add up to the total and the top reason is the one worth fixing first.
 *
 * Reads the local database only.
 *
 *   pnpm --filter @yacht-charter/providers audit:unsellable
 */
import { db } from "@yacht-charter/db";
import { MIN_LEAD_DAYS } from "@yacht-charter/db/search/read-model";
import { sql } from "drizzle-orm";

const SAMPLES_PER_REASON = 5;

type Row = {
  provider: string | null;
  reason: string;
  listings: number;
  samples: string[];
};

async function main(): Promise<void> {
  const { rows } = await db.execute<Row>(sql`
    with doc as (
      select d.listing_id, d.slug, p.code as provider
      from listing_search_doc d
      left join listing_offer bo on bo.id = d.best_offer_id
      left join provider p on p.id = bo.provider_id
      where d.bookable_from is null
    ),
    facts as (
      select
        doc.listing_id,
        doc.slug,
        doc.provider,
        exists (
          select 1 from listing_offer o where o.listing_id = doc.listing_id and o.status = 'active'
        ) as has_offer,
        exists (
          select 1 from listing_offer o
          join listing_free_period f on f.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and f.end_date > current_date + ${MIN_LEAD_DAYS}::int
        ) as has_free,
        exists (
          select 1 from listing_offer o
          join listing_price_period r on r.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and r.kind = 'weekly' and r.end_date > current_date
        ) as has_rate,
        exists (
          select 1 from listing_offer o
          join listing_free_period f on f.listing_offer_id = o.id
          join listing_price_period r on r.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and r.kind = 'weekly' and r.end_date > current_date
            and f.end_date > current_date + ${MIN_LEAD_DAYS}::int
            and f.start_date < r.end_date and f.end_date > r.start_date
        ) as free_meets_rate,
        exists (
          select 1 from listing_offer o
          join listing_checkin_rule c on c.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
        ) as has_rules,
        exists (
          select 1 from listing_offer o
          join listing_checkin_rule c on c.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and (c.season_end is null or c.season_end >= current_date)
        ) as rule_in_force,
        (
          select max(least(f.end_date, r.end_date) - greatest(f.start_date, r.start_date, current_date + ${MIN_LEAD_DAYS}::int))
          from listing_offer o
          join listing_free_period f on f.listing_offer_id = o.id
          join listing_price_period r on r.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and r.kind = 'weekly'
            and f.start_date < r.end_date and f.end_date > r.start_date
        ) as longest_priced_gap,
        (
          select min(coalesce(c.min_nights, 7))
          from listing_offer o
          join listing_checkin_rule c on c.listing_offer_id = o.id
          where o.listing_id = doc.listing_id and o.status = 'active'
            and (c.season_end is null or c.season_end >= current_date)
        ) as shortest_rule_stay
      from doc
    ),
    classified as (
      select
        provider,
        slug,
        case
          when not has_offer then '1 no active offer'
          when not has_free then '2 no free dates ahead (booked out, or occupancy not synced)'
          when not has_rate then '3 no published weekly rate ahead'
          when not free_meets_rate then '4 free dates fall outside every published rate'
          when has_rules and not rule_in_force then '5 every check-in rule has expired'
          when shortest_rule_stay is not null and longest_priced_gap < shortest_rule_stay
            then '6 free priced gaps shorter than the minimum stay'
          else '7 other: weekday, season or refusal alignment'
        end as reason
      from facts
    )
    select
      provider,
      reason,
      count(*)::int as listings,
      (array_agg(slug order by slug))[1:${SAMPLES_PER_REASON}] as samples
    from classified
    group by provider, reason
    order by provider nulls first, reason
  `);

  const total = rows.reduce((sum, row) => sum + row.listings, 0);
  console.log(`Published listings advertising no charter: ${total}\n`);
  for (const row of rows) {
    console.log(
      `${(row.provider ?? "(no offer)").padEnd(16)} ${String(row.listings).padStart(5)}  ${row.reason}`,
    );
    console.log(`${" ".repeat(23)}e.g. ${row.samples.join(", ")}`);
  }
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
