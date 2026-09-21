import { sql, type SQL } from "drizzle-orm";

import { toBaseMinorSql } from "../fx/rates";
import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { unavoidableCrew } from "./crew-sql";
import { unavoidableFees } from "./fees-sql";
import { extraChargedOnReturnFromFiledBase } from "./extra-scope-sql";
import { EARLIEST_CHECKIN } from "./lead-time";
import { listingScope } from "./listing-scope";
import { pricedMoney } from "./money-sql";
import {
  operatorConfirms,
  providerRank,
  sellableActiveOffer,
  sellableConfirmedSlot,
} from "./offer-sql";

/** The `offer_doc` CTE body: one priced, dated row per sellable offer of the listings in scope. */
export function offerDocSql(listingIds: readonly string[] | undefined): SQL {
  return sql`/*
       * One row per sellable offer, which is where every commercial answer is decided.
       *
       * All of this used to hang off the listing, so on a hull two vendors sell it read across
       * both: the cheapest rate of either, paired with a free week from the other and check-in
       * rules from a third place. That describes a charter neither vendor would honour. Every
       * join below keys on the offer id, so an offer is only ever priced against its own calendar,
       * its own rules and its own refusals.
       */
      select
        o.listing_id,
        o.id as offer_id,
        ${providerRank()} as provider_rank,
        ${operatorConfirms()} as operator_confirms,
        o.default_currency,
        o.security_deposit_minor,
        o.security_deposit_currency,
        o.security_deposit_when_insured_minor,
        o.deposit_insurance_included,
        o.crew_type,
        /*
         * Whether the operator bills a skipper whatever the customer picks.
         *
         * Kept beside crew_type rather than folded into it, because the two are read by
         * different things. The crew lateral above prices o.crew_type and deliberately skips
         * obligatory crew, which is already in the fee total; rewriting the column there would
         * have it reach for a second, optional skipper on top of the one being charged. Only
         * the projected column below is corrected, which is what the card, the crew filter and
         * the free-text blob read.
         */
        exists (
          select 1
          from provider_extra_catalogue extra
          where extra.listing_offer_id = o.id
            and extra.obligatory
            and extra.crew_role = 'skipper'
            and ${extraChargedOnReturnFromFiledBase()}
        ) as has_obligatory_skipper,
        rate.currency,
        avail.available_from,
        avail.available_to,
        checkin.bookable_from,
        checkin.bookable_to,
        /*
         * The all-in weekly price, because that is what the customer is asked to pay and what
         * the detail page totals. The rate alone advertised EUR 809 beside a booking summary
         * charging EUR 959: the difference is a cleaning fee nobody can decline, on every
         * Shannon hull.
         *
         * Only fees that apply whatever the customer chooses. A one-way fee is charged on a
         * route they have to pick, and folding it in would inflate every card for a charter
         * almost none of them will book.
         */
        money.all_in_minor,
        /* Whether the figure above prices this charter or starts from the season; see chosen. */
        chosen.price_is_from,
        /* Only ever rendered struck through beside the figure above; see the lateral. */
        list_money.list_all_in_minor,
        /*
         * The currency the figure beside it is actually in.
         *
         * The doc used to label it with the rate list's currency, which is a different
         * question: a confirmed slot answers in the money we asked the vendor for, while the
         * published list carries whichever the charter company set. Where those differ the
         * card printed a euro number with a dollar sign -- 95 listings here, all of them
         * Caribbean, understating the price by whatever the pair was worth that day.
         */
        money.price_currency,
        /* Carried through so the listing below can cap its guests by what this offer refuses. */
        o.guests_refused_from,
        /*
         * The same figure in one currency, for every comparison the catalogue makes across
         * listings -- the price sort, the price filter, the "from" aggregates, and the pick of
         * the best offer immediately below. See the price_from_minor_eur column comment.
         */
        ${toBaseMinorSql(sql`money.all_in_minor`, sql`money.price_currency`, sql`fx.rate`)}
          as all_in_minor_eur,
        /*
         * The charter rate on its own, which is the figure a visitor compares between sites.
         * Already computed for the lateral above and discarded until now; both are projected so
         * the display switch costs a cache purge rather than a rebuild of the fleet.
         */
        chosen.base_minor,
        /* On the same rate as its all-in twin: one lateral, so the two can never disagree
           about the day's conversion. */
        ${toBaseMinorSql(sql`chosen.base_minor`, sql`money.price_currency`, sql`fx.rate`)}
          as base_minor_eur
      from listing_offer o
      join provider p on p.id = o.provider_id
      ${cheapestSellableRateLateral()}
      ${availabilitySpanLateral()}
      ${firstBookableCharterLateral()}
      ${confirmedPriceLateral()}
      ${unavoidableFees(sql`coalesce(checkin.bookable_to - checkin.bookable_from, 7)`)}
      ${unavoidableCrew(sql`coalesce(checkin.bookable_to - checkin.bookable_from, 7)`)}
      ${chosenPriceLateral()}
      ${pricedMoney()}
      where ${sellableActiveOffer()}
        and ${listingScope(sql`o.listing_id`, listingIds)}`;
}

/** The `rate` lateral on offer `o`. */
function cheapestSellableRateLateral(): SQL {
  return sql`/*
       * The cheapest week this listing could actually sell.
       *
       * Read from the rate list rather than from unsold slots, because that made the headline
       * price depend on how the calendar had been cut and left a listing priceless wherever the
       * cut missed. Weekly only: a daily rate is not comparable to it.
       *
       * But the rate list alone is not a price either. Taken whole it includes seasons already
       * past and seasons the boat is booked solid through, and the minimum lands on one of them
       * far more often than not -- a Bavaria 32 advertised at EUR 145 for seven days off a
       * November rate, on a hull whose free dates are all the following year and carry no rate
       * at all. The card then quoted a week nobody could buy beside a detail page correctly
       * saying the yacht was priced on request.
       *
       * So a rate counts only if it still lies ahead and overlaps a stretch the provider has not
       * sold. That is weaker than bookable_from below, which proves a whole legal charter
       * fits; it is a "from" price and may name a week whose exact shape the rules refuse. It is
       * not weaker in the way that matters: every listing priced here has something to sell, and
       * a listing with nothing to sell is priced on request on both surfaces rather than one.
       */
      left join lateral (
        select min(price.price_minor) as price_from_minor, min(price.currency) as currency
        from listing_price_period price
        where price.listing_offer_id = o.id
          and price.kind = 'weekly'
          and price.end_date > current_date
          and exists (
            select 1
            from listing_free_period free
            where free.listing_offer_id = o.id
              and free.end_date > current_date
              and free.start_date < price.end_date
              and free.end_date > price.start_date
          )
      ) rate on true`;
}

/** The `avail` lateral on offer `o`. */
function availabilitySpanLateral(): SQL {
  return sql`/* Availability is the span of the free stretches, which are the complement of occupancy. */
      left join lateral (
        select
          min(free.start_date) as available_from,
          max(free.end_date) as available_to
        from listing_free_period free
        where free.listing_offer_id = o.id
      ) avail on true`;
}

/** The `checkin` lateral on offer `o`, over provider `p`. */
function firstBookableCharterLateral(): SQL {
  return sql`/*
       * The first charter this listing would actually sell, which is what an undated search card
       * shows in place of a period of its own. Mirrors canCheckIn and offeredCheckOut in
       * packages/api/src/lib/availability-rules.ts, and has to keep mirroring them: the card sends
       * the visitor to a calendar that evaluates those, and a period this invents that they refuse
       * is exactly the dead end the pair exists to close.
       *
       * available_from cannot answer this: it is the first day nothing is sold, which is today for
       * most of the fleet and, on a Saturday-to-Saturday boat, never a day anyone could board.
       *
       * Both ends, not just the start. A start day alone proves nothing follows it, so the tail of
       * a gap too short to sell, and every mid-week day of a listing that turns around on
       * Saturdays, read as bookable and sent the card's date to a calendar with no end to offer.
       * Requiring the whole charter inside the free period is what rules those out.
       *
       * The lengths are the rules' own, one per rule: its minimum, stepped up to its check-out
       * weekday, dropped if that overshoots its maximum. A rule that states no minimum is read as
       * a week (ASSUMED_NIGHTS in availability-rules.ts) rather than as a single night, because it
       * is a provider that published nothing, not one selling nights.
       *
       * Weekdays are stepped onto arithmetically rather than by walking a day at a time -- dow is
       * 0 Sunday, the numbering listing_checkin_rule stores. Past periods are excluded first, so
       * the row count stays proportional to the season ahead.
       *
       * Each rule is also confined to its own season, since a candidate start day outside it is
       * a day that rule never governed.
       */
      left join lateral (
        select candidates.bookable_from, candidates.bookable_to
        from (
        ${confirmedCharterCandidates()}

        union all

        ${inferredCharterCandidates()}
        ) candidates
        /*
         * The earliest charter, whichever kind established it. confirmed_first breaks a tie
         * on the same day, where the vendor's own word is the better description of one week
         * two rows both claim.
         *
         * It cannot outrank the date itself. Confirmation records where the sweep last looked,
         * not what the boat can sell: the sweep prices a few dozen periods a run out of a
         * fifteen-month horizon and rotates through them, so ranking it first advertised
         * whichever week it happened to ask about. Measured on the read model this projection
         * builds, 4,559 of 17,011 dated cards named a week more than a fortnight later than
         * the hull's own earliest free one, by 97 days on average and 451 at worst, and half
         * one deployment's fleet converged on a single week in March 2027. A visitor reading
         * "from" dates is asking when the boat is free, and that is a question about the boat.
         */
        order by candidates.bookable_from, candidates.confirmed_first, candidates.bookable_to
        limit 1
      ) checkin on true`;
}

/** The vendor-confirmed branch of the `checkin` candidates. */
function confirmedCharterCandidates(): SQL {
  return sql`/*
         * What the vendor itself said it would sell, and priced.
         *
         * The rest of this lateral is an inference: free stretches inverted from occupancy,
         * cut by the turnaround rules we hold a copy of, inside a season somebody published a
         * rate for. Both branches answer the same question -- can this hull be chartered that
         * week -- and the ordering below takes the earlier answer rather than the better
         * attested one.
         *
         * A confirmed week is still the sounder of two rows naming the same day, which is what
         * confirmed_first is for. On a random 25 dated cards, every card whose advertised
         * week the vendor had priced quoted on open and to the cent; the two that failed were
         * both advertising a week only the inference stood behind. That is a reason to widen
         * what the sweep confirms, and it is why only a confirmed slot may print a price --
         * see the chosen lateral below. It is not a reason to advertise a later week than the hull has.
         *
         * The turnaround rules do not apply to them. They once did, because the calendar greyed
         * out any period its rule copy refused and a card advertising one led to a picker that
         * disagreed. The calendar now accepts a vendor-confirmed charter too (the confirmed list in
         * availability-rules.ts), so the vendor's word stands on both surfaces.
         */
        select
          slot.start_date as bookable_from,
          slot.end_date as bookable_to,
          0 as confirmed_first
        from availability_slot slot
        where slot.listing_offer_id = o.id
          and ${sellableConfirmedSlot()}`;
}

/** The branch of the `checkin` candidates inferred from free periods, rates and check-in rules. */
function inferredCharterCandidates(): SQL {
  return sql`select c.candidate as bookable_from, c.candidate + n.nights as bookable_to, 1
        from listing_free_period free
        join listing_price_period price
          on price.listing_offer_id = o.id
         and price.kind = 'weekly'
         and price.end_date > current_date
         and price.start_date < free.end_date
         and price.end_date > free.start_date
        left join listing_checkin_rule rule on rule.listing_offer_id = o.id
        cross join lateral (
          select greatest(free.start_date, price.start_date, ${EARLIEST_CHECKIN}) as opens
        ) w
        cross join lateral (
          select case
            when rule.checkin_weekday is null then w.opens
            else w.opens + ((rule.checkin_weekday - extract(dow from w.opens)::int + 7) % 7)
          end as candidate
        ) c
        cross join lateral (
          select greatest(coalesce(rule.min_nights, 7), 1) as base
        ) b
        cross join lateral (
          select case
            when rule.checkout_weekday is null then b.base
            else b.base
               + ((rule.checkout_weekday
                   - extract(dow from c.candidate + b.base)::int + 7) % 7)
          end as nights
        ) n
        where free.listing_offer_id = o.id
          and free.end_date > current_date
          and c.candidate < least(free.end_date, price.end_date)
          and (rule.max_nights is null or n.nights <= rule.max_nights)
          and c.candidate + n.nights <= free.end_date
          /*
           * Only rules in force on the day the charter starts, which is how rulesOn reads them
           * in availability-rules.ts. Turnaround terms lapse, and a lapsed one used to apply
           * forever: the three-night any-day period NauSYS yacht 29476220 stopped selling in
           * May 2025 minted a three-night September 2026 card that its offers engine refused
           * while quoting the surrounding week happily.
           */
          and (rule.season_start is null or c.candidate >= rule.season_start)
          and (rule.season_end is null or c.candidate <= rule.season_end)
          /*
           * A charter that swallows a period the provider refused is one it will not sell either,
           * which is the containment rule wasRefused applies. Without this the card advertised the
           * cheapest week of the Shannon fleet -- free, priced, and declined by the vendor's own
           * offers engine -- and sent the visitor to a calendar that then greyed it out.
           */
          and not exists (
            select 1
            from listing_refused_period refused
            where refused.listing_offer_id = o.id
              and refused.start_date >= c.candidate
              and refused.end_date <= c.candidate + n.nights
              /* Only refusals something has re-confirmed lately; see REFUSAL_TRUST_DAYS. */
              and refused.updated_at > now() - make_interval(days => ${REFUSAL_TRUST_DAYS})
          )`;
}

/** The `confirmed` lateral, over `checkin`. */
function confirmedPriceLateral(): SQL {
  return sql`/*
       * What the vendor itself said this exact charter costs, where it was asked.
       *
       * The sweep asks freeYachtsSearch in the currency we transact in and stores the answer
       * verbatim, so this is a price the vendor stands behind, in the money the quote will use.
       * The published rate list cannot be either: catalogue/v6/priceLists takes no currency
       * parameter and carries whichever one the charter company set, which is how a Bahamas
       * fleet ends up advertised in USD beside a detail page quoting EUR.
       *
       * Price, currency and the obligatory-extras total are taken together or not at all. They
       * are one answer about one charter, and mixing a rate from the list with a fee total from
       * the offer adds two different currencies into one figure.
       *
       * Priced rows first, so an offer that recorded only a fee total still lends it below
       * without displacing a slot that can price the whole charter.
       */
      left join lateral (
        select slot.price_minor, slot.currency, slot.obligatory_extras_minor, slot.list_price_minor
        from availability_slot slot
        where slot.listing_offer_id = o.id
          and slot.start_date = checkin.bookable_from
          and slot.end_date = checkin.bookable_to
          and slot.availability_confirmed
        order by (slot.price_minor is null), slot.price_minor
        limit 1
      ) confirmed on true`;
}

/** The `chosen` lateral, over `confirmed` and `rate`. */
function chosenPriceLateral(): SQL {
  return sql`/*
       * In a lateral rather than the select list because the published figure and its converted
       * twin are both built from it, and repeating the expression is how the two drift apart.
       */
      /*
       * Two prices, and the card has to say which one it is holding.
       *
       * The vendor's own answer for the advertised charter is exact: that charter, that week,
       * that currency, net of the operator's discounts, and it is what the quote will total.
       *
       * Everything else falls back to the season minimum, which is a different KIND of number
       * rather than a worse version of the same one. The published rate list cannot price this
       * charter: both vendors sell below it -- NauSYS nets its discounts into clientPrice,
       * Booking Manager into price against a startPrice -- so a card printing that week's list
       * rate as if it were the price quoted above its own detail page by 5% to 53% across
       * eleven of thirty sampled listings, one week reading 2,070 against a quote of 1,458.
       * Nor can a weekly band price a charter of another length: prorated into three nights it
       * read 3,450 against a vendor quote of 1,621.
       *
       * The season minimum makes no claim about this week. It is the cheapest the operator
       * publishes for the season, which price_is_from marks so the card captions it "From"
       * instead of pricing a named charter with it. Measured against 11,897 cards carrying
       * both, it sits at or below the confirmed price 72% of the time, averaging 21.7% below:
       * a floor, in the direction a "from" price is allowed to be wrong.
       *
       * Withholding it instead was worse than either. 43 of the first 60 cards in the default
       * order read "on request", because that order ranks on rating and the unpriced weeks
       * were the well-rated ones.
       */
      cross join lateral (
        select
          case when confirmed.price_minor is not null then confirmed.currency
               else coalesce(rate.currency, o.default_currency) end as price_currency,
          coalesce(confirmed.price_minor, rate.price_from_minor) as base_minor,
          confirmed.price_minor is null as price_is_from
      ) chosen`;
}

/** The `best` CTE body: the one offer per listing the card is for. */
export function bestOfferSql(): SQL {
  return sql`select distinct on (listing_id) *
      from offer_doc
      /*
       * Ordered on the converted figure, because eight listings are sold by two vendors pricing
       * in different currencies and this comparison decided between them on the raw integers.
       * Falls back to the published one where no rate covers it, which is the single-currency
       * case it was always right for.
       */
      order by
        listing_id,
        /* A vendor that books online outranks one whose operator confirms by hand. */
        operator_confirms,
        /*
         * The client's agreed order, and deliberately not behind the display setting: this
         * decides which offer's row is projected, not which of its two figures a card shows.
         * Gating it would be the one thing that made the switch cost a rebuild -- and the order
         * itself was agreed unconditionally, cheapest rate first with the obligatory extras
         * settling a tie on it.
         */
        base_minor_eur asc nulls last,
        (all_in_minor_eur - base_minor_eur) asc nulls last,
        all_in_minor asc nulls last,
        provider_rank,
        offer_id`;
}

/** The `spread` CTE body: what every offer of a listing says together. */
export function offerSpreadSql(): SQL {
  return sql`select
        listing_id,
        min(available_from) as available_from,
        max(available_to) as available_to,
        count(*)::int as offer_count
      from offer_doc
      group by listing_id`;
}
