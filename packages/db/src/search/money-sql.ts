import { sql, type SQL } from "drizzle-orm";

import { usableRateSql } from "../fx/rates";

/**
 * The `money`, `list_money` and `fx` laterals, over `confirmed`, `chosen`, `fees` and `crew`.
 * One definition, so the document and `listing_period_price` total a charter identically.
 */
export function pricedMoney(): SQL {
  return sql`
      cross join lateral (
        select
          chosen.price_currency,
          case
            when chosen.base_minor is null then null
            else chosen.base_minor
                 + coalesce(
                     /*
                      * The offer's own fee total, which prices the ladder the catalogue makes us
                      * reassemble across season, length, party size, base and route -- dimensions
                      * not all published on every account, and wrong by a night's band on the
                      * Shannon fleet when rebuilt. Only where it is in the money being quoted:
                      * otherwise it is a correct number in the wrong currency.
                      */
                     case
                       when confirmed.currency is not distinct from chosen.price_currency
                       then confirmed.obligatory_extras_minor
                     end,
                     fees.unavoidable_minor,
                     0
                   )
                 /* Added to either source: a confirmed offer prices the charter and its
                    obligatory extras, never the crew the page will select for the visitor. */
                 + coalesce(crew.crew_minor, 0)
                 /*
                  * The percentage fees, against the charter this card is advertising. A
                  * confirmed offer already counts them in its own subtotal, so they are added
                  * only where the fees above were reconstructed from the catalogue.
                  */
                 + case
                     when confirmed.currency is not distinct from chosen.price_currency
                      and confirmed.obligatory_extras_minor is not null
                     then 0
                     else round(chosen.base_minor * coalesce(fees.unavoidable_pct, 0))::int
                   end
          end as all_in_minor
      ) money
      /*
       * The same all-in figure before the operator's discount, which is the number the card
       * strikes through.
       *
       * Built by adding the discount back rather than by totalling the list price afresh, so
       * the gap between the two figures is exactly the reduction the vendor granted and the
       * fees are counted once. The discount applies to the charter, not to the extras: adding
       * a percentage fee to the list price instead would strike a figure the vendor never
       * quoted anybody.
       *
       * Null unless the vendor priced this exact charter and its own discounts account for the
       * whole difference -- see availability_slot.list_price_minor -- so a card strikes a
       * figure only where the detail page beneath it strikes the same one.
       */
      cross join lateral (
        select case
          when money.all_in_minor is null then null
          when confirmed.price_minor is null or confirmed.list_price_minor is null then null
          when confirmed.list_price_minor <= confirmed.price_minor then null
          /* No currency test: a confirmed price is what the figure above is denominated in, so
             the list price beside it is already in the money being printed. */
          else money.all_in_minor + (confirmed.list_price_minor - confirmed.price_minor)
        end as list_all_in_minor
      ) list_money
      /* Resolved once per offer; the conversion reads it twice. */
      left join lateral (
        select ${usableRateSql(sql`money.price_currency`)} as rate
      ) fx on true
  `;
}
