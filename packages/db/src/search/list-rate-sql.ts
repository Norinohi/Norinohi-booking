import type { ProviderKey } from "@yacht-charter/env/providers";
import { sql, type SQL } from "drizzle-orm";

import { toBaseMinorSql } from "../fx/rates";
import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { unavoidableCrew } from "./crew-sql";
import { unavoidableFees } from "./fees-sql";
import { providerLeadDaysSql } from "./lead-time";
import { pricedMoney } from "./money-sql";
import { operatorConfirms, providerRank, sellableActiveOffer } from "./offer-sql";
import { rulesSellWindow } from "./sellable-starts";

/*
 * The one charter length a published weekly rate prices. `quotePreview` in packages/api borrows a
 * band for a week and for nothing else, and the projection's own measurement is why: prorated into
 * three nights a band read 3,450 against a vendor quote of 1,621. No daily list is synced.
 */
export const LIST_RATE_NIGHTS = 7;

/*
 * Booking Manager rows are one priced week, `[check-in, check-out)`, so the row ending on the
 * searched check-in is the week before it. NauSYS bands end on their last check-in day, so there
 * the same row does cover it.
 */
const HALF_OPEN_RATE_PROVIDER: ProviderKey = "booking_manager";

/**
 * The operator's published rate for exactly the week starting on `checkIn`, the week the card
 * names, as one `listing_period_price`-shaped row with `price_source = 'price-list'`, or no row.
 *
 * Only where a vendor has not priced the week itself; the caller tries that first. The rate is the
 * band covering the check-in day, cheapest first where lists overlap, as the price writer reads
 * them. The offer has to be able to sell the week:
 * free across it, past its vendor's notice, not refused or taken, and within the listing's rules.
 *
 * Totalled by the same fee, crew and money laterals as the projection's season minimum, and offers
 * compete on the document's order, so the figure is what the card would show had the list rate
 * been its stored price. It is a pre-discount number with no strike-through behind it.
 */
export function listRatePeriodPrice(listingId: SQL, checkIn: SQL, nights: number): SQL | undefined {
  if (nights !== LIST_RATE_NIGHTS) return undefined;

  const checkOut = sql`(${checkIn} + ${LIST_RATE_NIGHTS}::integer)`;

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
      'price-list'::text as price_source
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
      ) rate
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
      ${unavoidableFees(sql`${LIST_RATE_NIGHTS}::integer`)}
      ${unavoidableCrew(sql`${LIST_RATE_NIGHTS}::integer`)}
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
        and ${rulesSellWindow(listingId, checkIn, LIST_RATE_NIGHTS)}
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
