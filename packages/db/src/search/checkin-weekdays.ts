import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema";

/**
 * A hull the nightly price pass may ask about for a check-in on one weekday, with the season
 * the rule that admits it is in force for.
 *
 * Seasonal because turnaround terms lapse: a hull that turns around on Sunday all summer goes
 * back to Saturdays in October, and asking about its Sundays past the season buys an answer
 * the read model would not advertise. The caller filters by check-in date; the query cannot,
 * because one query serves every week of the horizon.
 *
 * Both bounds null means the rule states no season, or the offer publishes no rule at all.
 */
export type WeekdayCharterHull = {
  yachtId: string;
  seasonStart: string | null;
  seasonEnd: string | null;
};

export interface WeekdayCharterHullOptions {
  providerCode: string;
  /** The check-in weekday in Postgres `extract(dow)` terms: 0 is Sunday, 6 is Saturday. */
  weekday: number;
  nights: number;
}

/**
 * Which hulls could sell a charter of `nights` starting on `weekday`, by the operator's own rules.
 *
 * The Saturday pass asks the whole fleet because Saturday is what the fleet turns around on, and
 * a vendor asked about a shape it never sells simply answers with silence. Another weekday
 * cannot be asked that way: on the local catalogue 1,149 NauSYS hulls admit a Sunday week
 * against 7,348 that admit a Saturday one, so asking the fleet would spend six calls in seven
 * on hulls whose answer is known in advance.
 *
 * The test is the one `replaceRefusedPeriods` already applies before it writes a refusal --
 * weekday, minimum and maximum nights, season, check-out weekday deliberately left out -- so the
 * pass asks about exactly the hulls whose silence it is entitled to read as a refusal. An offer
 * that publishes no rule at all is included for the same reason the writer judges it: silence
 * from the operator is not a statement that the week is unsellable.
 */
export async function listWeekdayCharterHulls(
  db: NodePgDatabase<typeof schema>,
  options: WeekdayCharterHullOptions,
): Promise<WeekdayCharterHull[]> {
  const { rows } = await db.execute<WeekdayCharterHull>(sql`
    select distinct
      ls.external_yacht_id as "yachtId",
      to_char(c.season_start, 'YYYY-MM-DD') as "seasonStart",
      to_char(c.season_end, 'YYYY-MM-DD') as "seasonEnd"
    from listing_offer o
    join provider p on p.id = o.provider_id
    join listing_source ls on ls.id = o.listing_source_id
    join provider_record pr on pr.id = ls.provider_record_id
    left join listing_checkin_rule c
      on c.listing_offer_id = o.id
      and (c.checkin_weekday is null or c.checkin_weekday = ${options.weekday})
      and (c.min_nights is null or c.min_nights <= ${options.nights})
      and (c.max_nights is null or c.max_nights >= ${options.nights})
    where p.code = ${options.providerCode}
      and o.status = 'active'
      and pr.active
      and ls.listing_id is not null
      and ls.external_yacht_id is not null
      and (
        c.id is not null
        or not exists (select 1 from listing_checkin_rule r where r.listing_offer_id = o.id)
      )
  `);

  return rows;
}

/**
 * The hulls out of `hulls` whose admitting rule is in force on `checkIn`.
 *
 * A hull appears once per matching rule, so the same id can arrive with several seasons and one
 * of them covering the date is enough.
 */
export function hullsEligibleOn(hulls: readonly WeekdayCharterHull[], checkIn: string): string[] {
  const eligible = new Set<string>();
  for (const hull of hulls) {
    if (hull.seasonStart !== null && hull.seasonStart > checkIn) continue;
    if (hull.seasonEnd !== null && hull.seasonEnd < checkIn) continue;
    eligible.add(hull.yachtId);
  }

  return [...eligible];
}
