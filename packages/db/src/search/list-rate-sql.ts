import { sql, type SQL } from "drizzle-orm";

import { toBaseMinorSql } from "../fx/rates";
import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { unavoidableCrew } from "./crew-sql";
import { unavoidableFees } from "./fees-sql";
import { providerLeadDaysSql } from "./lead-time";
import { pricedMoney } from "./money-sql";
import { operatorConfirms, providerRank, sellableActiveOffer } from "./offer-sql";
import { rulesSellWindow } from "./sellable-starts";
import type { PeriodPriceSource } from "./types";
import { HALF_OPEN_RATE_PROVIDER, WEEKLY_RATE_NIGHTS } from "./weekly-estimate";

/*
 * The one charter length a published weekly rate prices outright. Any other length is only an
 * estimate from it (`price-list-estimate`): prorated into three nights a band read 3,450 against a
 * vendor quote of 1,621, which is why the card captions that figure as an estimate.
 */
export const LIST_RATE_NIGHTS = WEEKLY_RATE_NIGHTS;

/**
 * The operator's price list for exactly the charter starting on `checkIn`, the charter the card
 * names, as one `listing_period_price`-shaped row, or no row.
 *
 * A week reads the rate of the band covering the check-in day (`price_source = 'price-list'`).
 * Any other length is estimated per night (`price_source = 'price-list-estimate'`): see
 * `priceListEstimate`.
 *
 * Only where a vendor has not priced the charter itself; the caller tries that first. Where lists
 * overlap the cheapest band counts, as the price writer reads them. The offer has to be able to
 * sell the charter: free across it, past its vendor's notice, not refused or taken, and within the
 * listing's rules.
 *
 * Totalled by the same fee, crew and money laterals as the projection, for this many nights, and
 * offers compete on the document's order, so the figure is what the card would show had the rate
 * been its stored price. It is a pre-discount number with no strike-through behind it.
 */
export function listRatePeriodPrice(listingId: SQL, checkIn: SQL, nights: number): SQL | undefined {
  if (!Number.isInteger(nights) || nights < 1) return undefined;
  return nights === LIST_RATE_NIGHTS
    ? listPricedCharter(listingId, checkIn, nights, weekRate(checkIn), "price-list")
    : listPricedCharter(
        listingId,
        checkIn,
        nights,
        priceListEstimate(checkIn, nights),
        "price-list-estimate",
      );
}

/* The band covering the check-in day, as the `rate` lateral. */
function weekRate(checkIn: SQL): SQL {
  return sql`
      cross join lateral (
        select price.price_minor, price.currency
        from listing_price_period price
        where price.listing_offer_id = o.id
          and price.kind = 'weekly'
          and price.price_minor > 0
          and price.start_date <= ${checkIn}
          and (
            price.end_date > ${checkIn}
            or (price.end_date = ${checkIn} and p.code <> ${HALF_OPEN_RATE_PROVIDER})
          )
        order by price.price_minor
        limit 1
      ) rate`;
}

/*
 * `estimateFromWeeklyRates` in `weekly-estimate.ts`, as the `rate` lateral: each night takes the
 * cheapest band covering it, and the weekly rates summed over the nights are divided by seven and
 * rounded once. No row unless every night is covered, in one currency.
 *
 * The bands overlapping the charter are read in one index scan and matched to the nights in
 * memory, rather than one lookup per night.
 */
function priceListEstimate(checkIn: SQL, nights: number): SQL {
  const checkOut = sql`(${checkIn} + ${nights}::integer)`;
  return sql`
      cross join lateral (
        select
          round(sum(night.price_minor)::numeric / ${WEEKLY_RATE_NIGHTS}::integer)::integer
            as price_minor,
          min(night.currency) as currency
        from (
          select distinct on (n.night) n.night, band.price_minor, band.currency
          from (
            select price.start_date, price.end_date, price.price_minor, price.currency
            from listing_price_period price
            where price.listing_offer_id = o.id
              and price.kind = 'weekly'
              and price.price_minor > 0
              and price.start_date < ${checkOut}
              and price.end_date >= ${checkIn}
          ) band
          join generate_series(0, ${nights - 1}::integer) as n(night)
            on band.start_date <= ${checkIn} + n.night
            and (
              band.end_date > ${checkIn} + n.night
              or (band.end_date = ${checkIn} + n.night and p.code <> ${HALF_OPEN_RATE_PROVIDER})
            )
          order by n.night, band.price_minor
        ) night
        having count(*) = ${nights}::integer and count(distinct night.currency) = 1
      ) rate`;
}

function listPricedCharter(
  listingId: SQL,
  checkIn: SQL,
  nights: number,
  rate: SQL,
  source: PeriodPriceSource,
): SQL {
  const checkOut = sql`(${checkIn} + ${nights}::integer)`;

  return sql`
    select
      candidate.listing_id,
      candidate.start_date,
      candidate.end_date,
      candidate.offer_id,
      candidate.currency,
      candidate.all_in_minor,
      candidate.all_in_minor_eur,
      candidate.base_minor,
      candidate.base_minor_eur,
      candidate.list_all_in_minor,
      ${source}::text as price_source
    from (
      select
        o.listing_id,
        ${checkIn} as start_date,
        ${checkOut} as end_date,
        o.id as offer_id,
        money.price_currency as currency,
        money.all_in_minor,
        ${toBaseMinorSql(sql`money.all_in_minor`, sql`money.price_currency`, sql`fx.rate`)}
          as all_in_minor_eur,
        chosen.base_minor,
        ${toBaseMinorSql(sql`chosen.base_minor`, sql`money.price_currency`, sql`fx.rate`)}
          as base_minor_eur,
        null::integer as list_all_in_minor,
        ${operatorConfirms()} as operator_confirms,
        ${providerRank()} as provider_rank
      from listing_offer o
      join provider p on p.id = o.provider_id
      ${rate}
      cross join lateral (
        select
          null::integer as price_minor,
          null::text as currency,
          null::integer as obligatory_extras_minor,
          null::integer as list_price_minor
      ) confirmed
      cross join lateral (
        select rate.currency as price_currency, rate.price_minor as base_minor
      ) chosen
      ${unavoidableFees(sql`${nights}::integer`)}
      ${unavoidableCrew(sql`${nights}::integer`)}
      ${pricedMoney()}
      where o.listing_id = ${listingId}
        and ${sellableActiveOffer()}
        and ${checkIn} >= current_date + ${providerLeadDaysSql(sql`p.code`)}
        and exists (
          select 1
          from listing_free_period free
          where free.listing_offer_id = o.id
            and free.start_date <= ${checkIn}
            and free.end_date >= ${checkOut}
        )
        and not exists (
          select 1
          from availability_slot taken
          where taken.listing_offer_id = o.id
            and taken.status <> 'available'
            and taken.start_date < ${checkOut}
            and taken.end_date > ${checkIn}
        )
        and not exists (
          select 1
          from listing_refused_period refused
          where refused.listing_offer_id = o.id
            and refused.start_date >= ${checkIn}
            and refused.end_date <= ${checkOut}
            and refused.updated_at > now() - make_interval(days => ${REFUSAL_TRUST_DAYS})
        )
        and ${rulesSellWindow(listingId, checkIn, nights)}
    ) candidate
    where candidate.all_in_minor is not null and candidate.currency is not null
    order by
      candidate.operator_confirms,
      candidate.base_minor_eur asc nulls last,
      (candidate.all_in_minor_eur - candidate.base_minor_eur) asc nulls last,
      candidate.all_in_minor asc nulls last,
      candidate.provider_rank,
      candidate.offer_id
    limit 1
  `;
}
