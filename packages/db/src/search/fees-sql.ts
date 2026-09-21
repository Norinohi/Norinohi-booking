import { sql, type SQL } from "drizzle-orm";

import { extraChargedOnReturnFromFiledBase } from "./extra-scope-sql";

/** The obligatory fees for a charter of `nights`, as the `fees` lateral on offer `o`. */
export function unavoidableFees(nights: SQL): SQL {
  return sql`
      /*
       * What the advertised charter pays on top of the rate.
       *
       * One row per fee, choosing the variant that actually applies to the week on the card
       * rather than the cheapest anywhere. Providers file a fee as a ladder - Le Boat's moorings
       * fee is one row per night count, 60 EUR to six nights and 90 from seven - so the minimum
       * is a one-night price, and taking it advertised a weekly charter 30 EUR under the quote.
       *
       * Scoped to seasons overlapping what we sell, and excluding route-conditional fees: a
       * one-way fee is charged on a route the customer picks, and folding it in would inflate
       * every card for a charter almost none of them book.
       *
       * The night count falls back to a week when no bookable period is known, which is the
       * length the card's own label claims, and the price falls back to the cheapest variant
       * when the provider files no ladder at all.
       */
      left join lateral (
        select
          /*
           * Multiplied by what the operator prices the fee in, the same way the crew lateral
           * below already does and for the same reason: the vendor bills per day, per night or
           * per week and we were summing one of each. A catamaran advertised 4,960 EUR against
           * a quote of 6,955 -- a comfort package at 60 EUR "per day" counted once instead of
           * eight times, and a skipper at 225 the same.
           *
           * Per-person measures are left flat on purpose. The card is one figure for a listing
           * and knows no party size; multiplying by the berth count would price a couple's week
           * as if the boat were full, which is the wrong kind of wrong on a price somebody
           * decides to click on. Those fees stay understated until the quote states them, and
           * the quote is what anyone is asked to pay.
           */
          sum(
            applicable.price_minor
            * case
                when applicable.measure like 'per day%' or applicable.measure like 'per_day%'
                  then span.nights + 1
                when applicable.measure like 'per night%' or applicable.measure like 'per_night%'
                  then span.nights
                when applicable.measure like 'per week%' or applicable.measure like 'per_week%'
                  then ceil(span.nights::numeric / 7)
                else 1
              end
          )::int as unavoidable_minor,
          /*
           * Fees the operator states as a share of the charter rather than as money, summed as
           * rates and applied to the base in the money lateral below, which is the only place
           * that base exists. A 35% service charge is 7,910.00 on one hull here and nothing at
           * all on the catalogue row, so leaving it out is not the safe direction.
           */
          sum(applicable.percentage) as unavoidable_pct
        from (
          select ${nights} as nights
        ) span
        cross join lateral (
          select distinct on (extra.name)
            extra.price_minor,
            extra.percentage,
            coalesce(extra.price_measure, '') as measure
          from provider_extra_catalogue extra
          where extra.listing_offer_id = o.id
            and extra.obligatory
            and not extra.one_way_only
            /*
             * Never a row learned from a quote.
             *
             * The distinct-on-name above collapses a learned row onto the published one it
             * repeats, but only where the operator spells them the same. Two variants of one
             * fee are not: a hull here publishes a damage waiver "up to 2 weeks monohulls
             * 2018-2023" and is billed "catamarans and over 46ft monohulls", so counting both
             * would advertise 750 EUR of waiver against the 400 the charter pays. Nothing here
             * can tell which published row a billed one supersedes, so the sum stays on what
             * the vendor published and the detail page is where the real fee shows.
             */
            and extra.learned_at is null
            and ${extraChargedOnReturnFromFiledBase()}
            and (extra.season_end is null or extra.season_end >= current_date)
            and (
              extra.season_start is null
              or extra.season_start <= make_date(extract(year from current_date)::int + 1, 12, 31)
            )
          order by
            extra.name,
            /* A variant whose ladder covers this charter wins outright; otherwise cheapest. */
            (
              (extra.valid_nights_from is null or extra.valid_nights_from <= span.nights)
              and (extra.valid_nights_to is null or extra.valid_nights_to >= span.nights)
            ) desc,
            extra.price_minor
        ) applicable
      ) fees on true
  `;
}
