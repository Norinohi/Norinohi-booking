import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import type * as schema from "../schema";
import { toBaseMinorSql } from "../fx/rates";
import { unavoidableCrew } from "./crew-sql";
import { unavoidableFees } from "./fees-sql";
import { listingScope } from "./listing-scope";
import { pricedMoney } from "./money-sql";
import {
  operatorConfirms,
  providerRank,
  sellableActiveOffer,
  sellableConfirmedSlot,
} from "./offer-sql";

/*
 * The document columns a dated search reads from `listing_period_price` instead, where the
 * vendor priced exactly the dates asked for. Everything that compares, sorts or captions a price
 * reads these columns, so swapping them at the source keeps the card, the sort, the filter, the
 * slider and the map on one figure. The bookable week moves with them: it is the charter the
 * price describes, and the caption, the nightly division and the live-hold test all key on it.
 *
 * The rebuild uses the same set to replace a season minimum with the nearest week a vendor
 * priced; see `adoptNearestPricedWeek`.
 */
export const PERIOD_PRICE_COLUMNS = new Map([
  ["price_from_minor", sql`pp.all_in_minor`],
  ["price_from_minor_eur", sql`pp.all_in_minor_eur`],
  ["base_price_from_minor", sql`pp.base_minor`],
  ["base_price_from_minor_eur", sql`pp.base_minor_eur`],
  ["list_price_from_minor", sql`pp.list_all_in_minor`],
  ["currency", sql`pp.currency`],
  ["price_is_from", sql`false`],
  ["best_offer_id", sql`pp.offer_id`],
  ["bookable_from", sql`pp.start_date`],
  ["bookable_to", sql`pp.end_date`],
]);

/*
 * A card priced from the season minimum names no charter anyone quoted, so it reads
 * "seasonal minimum" beside a week it cannot price. Where a vendor has priced any later charter
 * of this listing, the card shows the nearest one instead, preferring a week because that is the
 * length the fleet sells and the one cards compare on. The season minimum stays only for a
 * listing no vendor has priced at all.
 *
 * After `rebuildListingPeriodPrices`, whose rows are already sellable, lead-time clear and
 * rule-checked, and before `markBestValue`, which should rank the price the card now shows.
 */
export async function adoptNearestPricedWeek(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[] | undefined,
) {
  const assignments = [...PERIOD_PRICE_COLUMNS].map(
    ([name, value]) => sql`${sql.identifier(name)} = ${value}`,
  );

  await db.execute(sql`
    update listing_search_doc doc
    set ${sql.join(assignments, sql`, `)}, updated_at = now()
    from (
      select distinct on (listing_id) *
      from listing_period_price
      where ${listingScope(sql`listing_id`, listingIds)}
      order by listing_id, (end_date - start_date) <> 7, start_date, end_date
    ) pp
    where pp.listing_id = doc.listing_id
      and doc.price_is_from
      and ${listingScope(sql`doc.listing_id`, listingIds)}
  `);
}

/**
 * Every charter a vendor has priced, totalled the way the document totals its own week.
 *
 * The confirmed slots are the same ones the document's bookable week is chosen from, filtered by
 * the same `sellableConfirmedSlot`, and priced by the same fee, crew and money laterals, so the
 * row for a listing's own bookable week matches its document to the cent. Offers compete per
 * charter on the document's order, since two vendors selling one hull can each win a different
 * week.
 *
 * Fees and crew depend on the offer and the charter length alone, not on which week it is, so
 * they are resolved once per offer and length: the fleet holds about 390,000 priced weeks and
 * a handful of lengths, and running both laterals per week is what made this slow.
 */
export async function rebuildListingPeriodPrices(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[] | undefined,
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      delete from listing_period_price pp
      where ${listingScope(sql`pp.listing_id`, listingIds)}
    `);

    await tx.execute(sql`
      insert into listing_period_price (
        listing_id,
        start_date,
        end_date,
        offer_id,
        currency,
        all_in_minor,
        all_in_minor_eur,
        base_minor,
        base_minor_eur,
        list_all_in_minor
      )
      with sellable_slot as (
        select
          o.listing_id,
          o.id as offer_id,
          ${providerRank()} as provider_rank,
          ${operatorConfirms()} as operator_confirms,
          slot.start_date,
          slot.end_date,
          slot.price_minor,
          slot.currency,
          slot.obligatory_extras_minor,
          slot.list_price_minor
        from listing_offer o
        join provider p on p.id = o.provider_id
        join listing l on l.id = o.listing_id and l.status = 'published'
        join availability_slot slot on slot.listing_offer_id = o.id
        where ${sellableActiveOffer()}
          and ${sellableConfirmedSlot()}
          and ${listingScope(sql`o.listing_id`, listingIds)}
      ),
      span_cost as (
        select spans.offer_id, spans.nights, fees.unavoidable_minor, fees.unavoidable_pct, crew.crew_minor
        from (
          select distinct offer_id, end_date - start_date as nights from sellable_slot
        ) spans
        join listing_offer o on o.id = spans.offer_id
        ${unavoidableFees(sql`spans.nights`)}
        ${unavoidableCrew(sql`spans.nights`)}
      ),
      priced as (
        select
          s.listing_id,
          s.offer_id,
          s.provider_rank,
          s.operator_confirms,
          s.start_date,
          s.end_date,
          money.price_currency,
          money.all_in_minor,
          list_money.list_all_in_minor,
          ${toBaseMinorSql(sql`money.all_in_minor`, sql`money.price_currency`, sql`fx.rate`)}
            as all_in_minor_eur,
          chosen.base_minor,
          ${toBaseMinorSql(sql`chosen.base_minor`, sql`money.price_currency`, sql`fx.rate`)}
            as base_minor_eur
        from sellable_slot s
        join span_cost cost
          on cost.offer_id = s.offer_id and cost.nights = s.end_date - s.start_date
        cross join lateral (
          select s.price_minor, s.currency, s.obligatory_extras_minor, s.list_price_minor
        ) confirmed
        cross join lateral (
          select cost.unavoidable_minor, cost.unavoidable_pct
        ) fees
        cross join lateral (select cost.crew_minor) crew
        cross join lateral (
          select s.currency as price_currency, s.price_minor as base_minor, false as price_is_from
        ) chosen
        ${pricedMoney()}
      )
      select distinct on (listing_id, start_date, end_date)
        listing_id,
        start_date,
        end_date,
        offer_id,
        price_currency,
        all_in_minor,
        all_in_minor_eur,
        base_minor,
        base_minor_eur,
        list_all_in_minor
      from priced
      where all_in_minor is not null and price_currency is not null
      /* The document's own order between offers; see \`best\` above. */
      order by
        listing_id,
        start_date,
        end_date,
        operator_confirms,
        base_minor_eur asc nulls last,
        (all_in_minor_eur - base_minor_eur) asc nulls last,
        all_in_minor asc nulls last,
        provider_rank,
        offer_id
    `);
  });
}
