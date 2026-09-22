import { sql, type SQL } from "drizzle-orm";

import { extraChargedOnReturnFromFiledBase } from "./extra-scope-sql";

/** The crew nobody can decline for a charter of `nights`, as the `crew` lateral on offer `o`. */
export function unavoidableCrew(nights: SQL): SQL {
  return sql`
      /*
       * The crew the customer cannot decline.
       *
       * A crewed listing is sold with people aboard, and the detail page opens on the listing's
       * own first crew option rather than on a choice the visitor made -- so the sidebar prices
       * the crew before they touch anything. The card was pricing the hull alone: Noe Sarnico
       * 65 advertised EUR 41,142.85 beside a page that opened at EUR 43,542.85, the difference
       * being a chef nobody could have declined.
       *
       * Which roles ride along mirrors crewServiceIdsFor in the NauSYS quote mapper, because
       * that is what the sidebar will actually be quoted: everything for a full-crew charter,
       * the skipper alone for a skippered one, nothing for a bareboat. Kept apart from the fees
       * above rather than folded into them, because a vendor-confirmed offer brings its own
       * obligatory-extras total and crew is not in it.
       */
      left join lateral (
        select
          sum(
            applicable.price_minor
            * case
                /* What the vendor multiplies by, checked against its own arithmetic: a chef at
                   EUR 300 "per day + food" on a seven-night charter was billed 2,400, which is
                   the eight calendar days the boat is held, not the seven nights aboard. */
                when applicable.measure like 'per day%' then span.nights + 1
                when applicable.measure like 'per night%' then span.nights
                when applicable.measure like 'per week%' then ceil(span.nights::numeric / 7)
                else 1
              end
          )::int as crew_minor
        from (
          select ${nights} as nights
        ) span
        cross join lateral (
          /*
           * One person per role, not one per row the operator named.
           *
           * Distinct on the name counted every differently-named row a role matched, and
           * operators file plenty: beside "Skipper" sit "Skipper training practice", "Checkout
           * Skipper", "Captain By Day", "Fun Pack skipper surcharge" and "Additional fee for
           * Skipper in forepeak" -- 727 listings carry more than one. A charter is sold with
           * one skipper aboard, so the card charges for one, and the cheapest row that covers
           * the week is the closest thing to the plain rate among them.
           */
          select distinct on (extra.crew_role)
            extra.price_minor,
            coalesce(extra.price_measure, '') as measure
          from provider_extra_catalogue extra
          where extra.listing_offer_id = o.id
            and extra.crew_role is not null
            and ${extraChargedOnReturnFromFiledBase()}
            /*
             * Only the crew nothing has counted yet. An operator that files its skipper as an
             * obligatory extra has it in both fee totals already -- the catalogue sum beside
             * this lateral, and the vendor's own subtotal on a confirmed offer -- so adding it
             * here charged for the skipper twice: Sargantal advertised EUR 11,268 against a
             * quote of EUR 9,268, the difference being one skipper.
             */
            and not extra.obligatory
            and (
              o.crew_type = 'full-crew'
              or (o.crew_type = 'skipper' and extra.crew_role = 'skipper')
            )
            /* Priced by the hour or by the piece, this cannot be multiplied out from a
               catalogue row: 97 of 13,518 crew rows, left out rather than guessed at. */
            and coalesce(extra.price_measure, '') not like '%hour%'
            and coalesce(extra.price_measure, '') not like '%piece%'
            and (extra.season_end is null or extra.season_end >= current_date)
            and (
              extra.season_start is null
              or extra.season_start <= make_date(extract(year from current_date)::int + 1, 12, 31)
            )
          order by
            extra.crew_role,
            (
              (extra.valid_nights_from is null or extra.valid_nights_from <= span.nights)
              and (extra.valid_nights_to is null or extra.valid_nights_to >= span.nights)
            ) desc,
            extra.price_minor
        ) applicable
      ) crew on true
  `;
}
