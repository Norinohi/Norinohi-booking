import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, sql, type SQL } from "drizzle-orm";

import type * as schema from "../schema";
import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { listing } from "../schema/listing";
import { toBaseMinorSql, usableRateSql } from "../fx/rates";
import { normalizedKeySql } from "./localize";

/**
 * Booking Manager photographs better than NauSYS, so its rows front a listing
 * that carries both (architecture §3). Mirrors `pickPrimaryImage` in
 * packages/api/src/services/match.ts; the two must agree or the search card and
 * the duplicate-review screen show different boats.
 */
const MEDIA_SOURCE_RANK = sql`case lm.source when 'booking_manager' then 0 when 'nausys' then 1 else 2 end`;

/**
 * An admin's pinned choice, ahead of the rule.
 *
 * `listing_field_source` is where the resolver records which offer supplies each group, and a
 * `locked` row is a person overruling it. Media is resolved here rather than by the resolver —
 * the rank below is the whole decision — so without this the override was recorded, shown as
 * pinned, and changed nothing at all.
 */
const PINNED_OFFER = (field: string) => sql`(
  select f.listing_offer_id
  from listing_field_source f
  where f.listing_id = l.id and f.field = ${sql.raw(`'${field}'`)} and f.locked
)`;

const PINNED_MEDIA_FIRST = sql`case when lm.listing_offer_id = ${PINNED_OFFER("media")} then 0 else 1 end`;

const MEDIA_ROLE_RANK = sql`case lm.role when 'main' then 0 when 'gallery' then 1 else 2 end`;

export type RebuildListingSearchDocsOptions = {
  listingIds?: readonly string[];
};

export async function rebuildListingSearchDocs(
  db: NodePgDatabase<typeof schema>,
  options: RebuildListingSearchDocsOptions = {},
) {
  const listingIds = options.listingIds ? uniqueIds(options.listingIds) : undefined;
  if (options.listingIds && listingIds?.length === 0) return;

  await db.execute(sql`
    with offer_doc as (
      /*
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
        /* Architecture section 3: Booking Manager takes a tie. */
        case p.code when 'booking_manager' then 0 when 'nausys' then 1 else 2 end as provider_rank,
        o.default_currency,
        o.security_deposit_minor,
        o.security_deposit_currency,
        o.security_deposit_when_insured_minor,
        o.deposit_insurance_included,
        o.crew_type,
        rate.currency,
        avail.available_from,
        avail.available_to,
        avail.has_unconfirmed_availability,
        checkin.bookable_from,
        checkin.bookable_to,
        held.has_temporary_booking,
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
          as all_in_minor_eur
      from listing_offer o
      join provider p on p.id = o.provider_id
      /*
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
      ) rate on true
      /*
       * Availability is the span of the free stretches, which are the complement of occupancy.
       * A stretch counts as unconfirmed unless the provider priced that exact period on request,
       * which is what has_unconfirmed_availability has always meant: we inferred this.
       */
      left join lateral (
        select
          min(free.start_date) as available_from,
          max(free.end_date) as available_to,
          bool_or(
            not exists (
              select 1
              from availability_slot confirmed
              where confirmed.listing_offer_id = o.id
                and confirmed.status = 'available'
                and confirmed.availability_confirmed
                and confirmed.start_date <= free.start_date
                and confirmed.end_date >= free.end_date
            )
          ) as has_unconfirmed_availability
        from listing_free_period free
        where free.listing_offer_id = o.id
      ) avail on true
      /*
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
        /*
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
         * The turnaround rules still apply to them, which is not obvious and was wrong the
         * first time. The vendor's word beats our copy of its rules on the merits -- it sold
         * the week -- but the detail page will not open on a period rangeStatus refuses, and
         * the calendar greys those days out, so a card advertising one sends the customer to a
         * picker that disagrees with it. 21 of 150 sampled cards landed in that state:
         * Friday and Sunday check-ins the vendor had priced against a rule copy that says
         * Saturday. Until the calendar itself learns to trust a confirmed slot, the honest
         * ceiling for a card is what both of them accept.
         */
        select
          slot.start_date as bookable_from,
          slot.end_date as bookable_to,
          0 as confirmed_first
        from availability_slot slot
        where slot.listing_offer_id = o.id
          and slot.availability_confirmed
          and slot.status = 'available'
          and slot.price_minor is not null
          and slot.start_date >= current_date
          /* A refusal is the later word, and occupancy from a newer dump outranks both. */
          and not exists (
            select 1
            from listing_refused_period refused
            where refused.listing_offer_id = o.id
              and refused.start_date >= slot.start_date
              and refused.end_date <= slot.end_date
              and refused.updated_at > now() - make_interval(days => ${REFUSAL_TRUST_DAYS})
          )
          and not exists (
            select 1
            from availability_slot taken
            where taken.listing_offer_id = o.id
              and taken.status <> 'available'
              and taken.start_date < slot.end_date
              and taken.end_date > slot.start_date
          )
          /*
           * No published-rate test here, unlike the inferred candidates below. seasonOpen asks
           * whether anyone has priced the stretch, and this row is the vendor pricing it: the
           * constraints endpoint reads confirmed slots as rates for exactly that reason, so the
           * calendar accepts these days too. Requiring a band as well hid 210 charters the
           * vendor had quoted us a price for.
           */
          /* What rangeStatus asks of the same period: any rule in force on the check-in day
             that admits this shape, or no published rule at all. */
          and (
            not exists (
              select 1 from listing_checkin_rule any_rule
              where any_rule.listing_offer_id = o.id
            )
            or exists (
              select 1
              from listing_checkin_rule rule
              where rule.listing_offer_id = o.id
                and (rule.season_start is null or slot.start_date >= rule.season_start)
                and (rule.season_end is null or slot.start_date <= rule.season_end)
                and (
                  rule.checkin_weekday is null
                  or extract(dow from slot.start_date)::int = rule.checkin_weekday
                )
                and (
                  rule.checkout_weekday is null
                  or extract(dow from slot.end_date)::int = rule.checkout_weekday
                )
                and (rule.min_nights is null or slot.end_date - slot.start_date >= rule.min_nights)
                and (rule.max_nights is null or slot.end_date - slot.start_date <= rule.max_nights)
            )
          )

        union all

        select c.candidate as bookable_from, c.candidate + n.nights as bookable_to, 1
        from listing_free_period free
        join listing_price_period price
          on price.listing_offer_id = o.id
         and price.kind = 'weekly'
         and price.end_date > current_date
         and price.start_date < free.end_date
         and price.end_date > free.start_date
        left join listing_checkin_rule rule on rule.listing_offer_id = o.id
        cross join lateral (
          select greatest(free.start_date, price.start_date, current_date) as opens
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
          )
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
      ) checkin on true
      /*
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
      ) confirmed on true
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
          select coalesce(checkin.bookable_to - checkin.bookable_from, 7) as nights
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
             * Only fees charged where this charter starts.
             *
             * The operator files a fee per base as well as per season, and most of them do:
             * 130,535 of NauSYS's 184,539 priced extras rows name the bases they apply at. A
             * row whose list does not include the base it was filed under is charged at some
             * other base, and adding it here put fees on a card no charter from here pays.
             */
            and (
              extra.valid_for_base_ids is null
              or extra.external_base_id is null
              or extra.external_base_id = any(extra.valid_for_base_ids)
            )
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
          select coalesce(checkin.bookable_to - checkin.bookable_from, 7) as nights
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
            /*
             * Only fees charged where this charter starts.
             *
             * The operator files a fee per base as well as per season, and most of them do:
             * 130,535 of NauSYS's 184,539 priced extras rows name the bases they apply at. A
             * row whose list does not include the base it was filed under is charged at some
             * other base, and adding it here put fees on a card no charter from here pays.
             */
            and (
              extra.valid_for_base_ids is null
              or extra.external_base_id is null
              or extra.external_base_id = any(extra.valid_for_base_ids)
            )
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
      left join lateral (
        select bool_or(slot.status = 'option') as has_temporary_booking
        from availability_slot slot
        where slot.listing_offer_id = o.id
      ) held on true
      /*
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
      ) chosen
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
      where o.status = 'active'
        /*
         * A hull the operator has retired. NauSYS keeps it in the catalogue dump with the date
         * it left the fleet, so nothing about the sync notices; the boat simply cannot be
         * chartered any more. Dropped here rather than deleted, because a charter already
         * booked on it still has to be readable.
         */
        and (o.out_of_fleet_date is null or o.out_of_fleet_date > current_date)
        and ${listingScope(sql`o.listing_id`, listingIds)}
    ),
    /*
     * The offer the card is for: cheapest all-in, ties to Booking Manager, then the offer id so
     * the document does not churn between two equal answers. Price, dates and terms all come
     * from this one row, because a card pricing one vendor's week beside another vendor's dates
     * would send the visitor to a quote that disagrees with it.
     */
    best as (
      select distinct on (listing_id) *
      from offer_doc
      /*
       * Ordered on the converted figure, because eight listings are sold by two vendors pricing
       * in different currencies and this comparison decided between them on the raw integers.
       * Falls back to the published one where no rate covers it, which is the single-currency
       * case it was always right for.
       */
      order by
        listing_id,
        all_in_minor_eur asc nulls last,
        all_in_minor asc nulls last,
        provider_rank,
        offer_id
    ),
    /*
     * The questions that are about the boat rather than about one seller. It is free if any
     * vendor says so, and the window is the union of theirs: search asks "is this boat free
     * then", and the quote settles which vendor sells it.
     */
    spread as (
      select
        listing_id,
        min(available_from) as available_from,
        max(available_to) as available_to,
        bool_or(has_unconfirmed_availability) as has_unconfirmed_availability,
        bool_or(has_temporary_booking) as has_temporary_booking,
        count(*)::int as offer_count
      from offer_doc
      group by listing_id
    )
    insert into listing_search_doc (
      listing_id,
      slug,
      name,
      title,
      category,
      crew_type,
      builder,
      model,
      model_canonical,
      operator,
      operator_terms_and_conditions,
      base_id,
      base_name,
      city,
      location,
      region,
      country,
      lat,
      lng,
      base_email,
      base_phone,
      base_website,
      base_check_in_time,
      base_check_out_time,
      length_m,
      cabins,
      berths,
      max_guests,
      heads,
      showers,
      year_built,
      sail_type,
      security_deposit_minor,
      security_deposit_currency,
      security_deposit_when_insured_minor,
      deposit_insurance_included,
      pets_allowed,
      rating,
      review_count,
      main_image,
      gallery,
      amenities,
      price_from_minor,
      price_is_from,
      list_price_from_minor,
      currency,
      price_from_minor_eur,
      best_offer_id,
      offer_count,
      available_from,
      available_to,
      bookable_from,
      bookable_to,
      has_unconfirmed_availability,
      has_temporary_booking,
      searchable_text,
      created_at,
      updated_at
    )
    select
      l.id,
      l.slug,
      l.name,
      l.title,
      -- The marketplace category, not the vendor's: facets group on this column, and
      -- ungrouped vendor near-synonyms would each become their own facet. An
      -- unclassified category falls back to its own name rather than dropping out.
      coalesce(cat.canonical_name, cat.name),
      coalesce(best.crew_type, l.crew_type),
      -- The brand, not the legal entity: providers send "Bavaria Yachtbau" and "Lagoon-Bénéteau",
      -- and grouped by those the same brand splits into several shipyard pages and filters.
      coalesce(bld.canonical_name, bld.name),
      mdl.name,
      -- The grouping name, like the category above: a model with no cabin suffix to strip has no
      -- canonical of its own, and writing that null left every model page without a value to
      -- group on.
      coalesce(mdl.canonical_name, mdl.name),
      op.name,
      op.terms_and_conditions,
      bs.id,
      bs.name,
      loc.city,
      loc.name,
      rgn.name,
      cty.name,
      bs.lat,
      bs.lng,
      bs.email,
      bs.phone,
      bs.website,
      bs.check_in_time,
      bs.check_out_time,
      spec.length_m,
      spec.cabins,
      spec.berths,
      /*
       * What the boat can actually be sold to.
       *
       * Berths are what it sleeps; a vendor's offers engine may sell fewer and say so nowhere
       * -- Booking Manager's maxPeopleOnBoard is null on all 12,813 products we hold. What we
       * have instead is what it has already refused, learned at quote time, and one below that
       * is the most we know it will take.
       */
      least(spec.berths, best.guests_refused_from - 1) as max_guests,
      spec.heads,
      spec.showers,
      spec.year_built,
      spec.sail_type,
      /*
       * Only ever shown as "plus a refundable deposit"; a zero is the provider saying it takes
       * none, so it is stored as null and the card omits the line.
       *
       * So is a deposit the card cannot state in its own money. The figure here is the
       * catalogue's, in whatever currency the operator set, while the price beside it now
       * follows the vendor's confirmed answer -- which is how 94 cards came to offer a EUR
       * charter with a USD deposit under it. The vendor states the real one per period at
       * quote time (depositAmount, which the sidebar shows), so the honest card omits the
       * line rather than printing two currencies or inventing a conversion.
       */
      case
        when coalesce(best.security_deposit_currency, l.security_deposit_currency) is null
          or coalesce(best.security_deposit_currency, l.security_deposit_currency)
             = coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency)
        then nullif(coalesce(best.security_deposit_minor, l.security_deposit_minor), 0)
      end,
      case
        when coalesce(best.security_deposit_minor, l.security_deposit_minor) > 0
          then coalesce(best.security_deposit_currency, l.security_deposit_currency)
      end,
      /*
       * The reduced deposit, under the same currency guard as the deposit itself: it is quoted
       * in that same currency, so a card that had to drop one must drop both rather than show a
       * "with insurance" figure beside no ordinary figure to compare it against.
       *
       * The nullif and the less-than test are the projection's rule restated in SQL - NauSYS
       * sends a bare 0 on most hulls and, on a few, a figure no lower than the ordinary deposit.
       * Neither is a reduction, and advertising one would promise the guest something the base
       * will not honour.
       */
      case
        when coalesce(best.security_deposit_currency, l.security_deposit_currency) is null
          or coalesce(best.security_deposit_currency, l.security_deposit_currency)
             = coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency)
        then nullif(
          case
            when coalesce(best.security_deposit_when_insured_minor, l.security_deposit_when_insured_minor)
                 < coalesce(best.security_deposit_minor, l.security_deposit_minor)
            then coalesce(best.security_deposit_when_insured_minor, l.security_deposit_when_insured_minor)
          end, 0)
      end,
      coalesce(best.deposit_insurance_included, l.deposit_insurance_included),
      l.pets_allowed,
      -- Our own reviews win outright; the provider aggregate only fills the gap
      -- for a listing nobody has reviewed here. The two are never averaged: they
      -- count different populations of guests.
      coalesce(
        case when rev.review_count > 0 then rev.rating end,
        l.provider_rating,
        0
      )::numeric(3, 2),
      coalesce(nullif(rev.review_count, 0), l.provider_review_count, 0)::integer,
      media.main_image,
      coalesce(media.gallery, '[]'::jsonb),
      coalesce(amn.amenities, '[]'::jsonb),
      /*
       * The all-in weekly price, because that is what the customer is asked to pay and what the
       * detail page totals. The rate alone advertised EUR 809 beside a booking summary charging
       * EUR 959: the difference is a cleaning fee nobody can decline, on every Shannon hull.
       *
       * Only fees that apply whatever the customer chooses. A one-way fee is charged on a route
       * they have to pick, and folding it in would inflate every card for a charter almost none
       * of them will book.
       */
      best.all_in_minor,
      /* A listing with no offer at all has no price to qualify, so it is not a "from" either. */
      coalesce(best.price_is_from, false),
      best.list_all_in_minor,
      coalesce(best.price_currency, best.currency, best.default_currency, l.default_currency),
      best.all_in_minor_eur,
      best.offer_id,
      coalesce(spread.offer_count, 0),
      spread.available_from,
      spread.available_to,
      best.bookable_from,
      best.bookable_to,
      coalesce(spread.has_unconfirmed_availability, false),
      coalesce(spread.has_temporary_booking, false),
      concat_ws(
        ' ',
        l.title,
        -- Both spellings: a guest searching the vendor's wording ("motor boat")
        -- and one searching the group ("motor yacht") must both hit this listing.
        cat.name,
        cat.canonical_name,
        coalesce(best.crew_type, l.crew_type),
        bld.name,
        bld.canonical_name,
        mdl.name,
        op.name,
        bs.name,
        loc.name,
        rgn.name,
        cty.name,
        spec.sail_type,
        amn.amenity_text,
        txt.description
      ),
      now(),
      now()
    from listing l
    join operator op on op.id = l.operator_id
    join base bs on bs.id = l.home_base_id
    join location loc on loc.id = bs.location_id
    join region rgn on rgn.id = loc.region_id
    join country cty on cty.id = rgn.country_id
    left join yacht_category cat on cat.id = l.category_id
    left join builder bld on bld.id = l.builder_id
    left join yacht_model mdl on mdl.id = l.model_id
    left join listing_specification spec on spec.listing_id = l.id
    /*
     * Media precedence, not alphabetical order. A merged listing carries rows from
     * every provider linked to it, and architecture section 3 prefers Booking
     * Manager's photos over NauSYS's. The previous min(external_url) picked
     * whichever URL sorted first, which is arbitrary and would have let the losing
     * provider's image front a merged card.
     *
     * Identical output for a single-source listing with one main row, which is
     * every listing until a merge happens.
     */
    left join lateral (
      select
        (
          select lm.external_url
          from listing_media lm
          where lm.listing_id = l.id
          order by ${PINNED_MEDIA_FIRST}, ${MEDIA_SOURCE_RANK}, ${MEDIA_ROLE_RANK}, lm.sort_order
          limit 1
        ) as main_image,
        (
          select jsonb_agg(
            lm.external_url order by ${PINNED_MEDIA_FIRST}, ${MEDIA_SOURCE_RANK}, lm.sort_order
          )
          from listing_media lm
          where lm.listing_id = l.id
        ) as gallery
    ) media on true
    /*
     * Equipment, folded to one entry per thing however each vendor spells it.
     *
     * The two providers keep separate amenity taxonomies — codes are scoped per provider, so
     * Autopilot exists once as each vendor's own row — and a listing both of them sell carries
     * both. Thirty names overlap that way today, and unfolded they would each appear twice on
     * the card and twice in the searchable text. Folded on the name the same way the facet
     * dictionary folds it, since that is the only thing the two rows share.
     *
     * Included by any vendor counts as included: the array answers what the yacht has, and the
     * priced crew roles are read from their own table.
     */
    left join lateral (
      select
        jsonb_agg(folded.name order by folded.name) filter (where folded.included) as amenities,
        string_agg(folded.name, ' ') as amenity_text
      from (
        select
          min(a.name) as name,
          bool_or(la.obligatory = false and la.price_minor is null) as included
        from listing_amenity la
        join amenity a on a.id = la.amenity_id
        where la.listing_id = l.id
        group by ${normalizedKeySql(sql`a.name`)}
      ) folded
    ) amn on true
    left join best on best.listing_id = l.id
    left join spread on spread.listing_id = l.id
    left join lateral (
      select lt.value as description
      from listing_text lt
      where lt.listing_id = l.id and lt.kind = 'description' and lt.locale = 'en'
      /* Same as the media above: a pinned vendor's prose wins, otherwise whichever is there. */
      order by case when lt.listing_offer_id = ${PINNED_OFFER("description")} then 0 else 1 end
      limit 1
    ) txt on true
    left join lateral (
      select avg(rating)::numeric(3, 2) as rating, count(*)::integer as review_count
      from review review
      where review.listing_id = l.id
    ) rev on true
    where l.status = 'published'
      and ${listingScope(sql`l.id`, listingIds)}
    on conflict (listing_id) do update set
      slug = excluded.slug,
      name = excluded.name,
      title = excluded.title,
      category = excluded.category,
      crew_type = excluded.crew_type,
      builder = excluded.builder,
      model = excluded.model,
      model_canonical = excluded.model_canonical,
      operator = excluded.operator,
      operator_terms_and_conditions = excluded.operator_terms_and_conditions,
      base_id = excluded.base_id,
      base_name = excluded.base_name,
      city = excluded.city,
      location = excluded.location,
      region = excluded.region,
      country = excluded.country,
      lat = excluded.lat,
      lng = excluded.lng,
      base_email = excluded.base_email,
      base_phone = excluded.base_phone,
      base_website = excluded.base_website,
      base_check_in_time = excluded.base_check_in_time,
      base_check_out_time = excluded.base_check_out_time,
      length_m = excluded.length_m,
      cabins = excluded.cabins,
      berths = excluded.berths,
      max_guests = excluded.max_guests,
      heads = excluded.heads,
      showers = excluded.showers,
      year_built = excluded.year_built,
      sail_type = excluded.sail_type,
      security_deposit_minor = excluded.security_deposit_minor,
      security_deposit_currency = excluded.security_deposit_currency,
      security_deposit_when_insured_minor = excluded.security_deposit_when_insured_minor,
      deposit_insurance_included = excluded.deposit_insurance_included,
      pets_allowed = excluded.pets_allowed,
      rating = excluded.rating,
      review_count = excluded.review_count,
      main_image = excluded.main_image,
      gallery = excluded.gallery,
      amenities = excluded.amenities,
      price_from_minor = excluded.price_from_minor,
      price_is_from = excluded.price_is_from,
      list_price_from_minor = excluded.list_price_from_minor,
      price_from_minor_eur = excluded.price_from_minor_eur,
      best_offer_id = excluded.best_offer_id,
      offer_count = excluded.offer_count,
      currency = excluded.currency,
      available_from = excluded.available_from,
      available_to = excluded.available_to,
      bookable_from = excluded.bookable_from,
      bookable_to = excluded.bookable_to,
      has_unconfirmed_availability = excluded.has_unconfirmed_availability,
      has_temporary_booking = excluded.has_temporary_booking,
      searchable_text = excluded.searchable_text,
      updated_at = now()
  `);

  await db.execute(sql`
    delete from listing_search_doc doc
    where ${listingScope(sql`doc.listing_id`, listingIds)}
      and not exists (
      select 1
      from listing l
      where l.id = doc.listing_id and l.status = 'published'
    )
  `);
}

/**
 * What the projection currently holds, for an operator who has just rebuilt it by hand.
 *
 * A rebuild that writes the right number of rows but prices none of them has failed in a
 * way a row count alone cannot show, and the entry point that runs it lives in `apps/server`,
 * which deliberately does not depend on drizzle-orm. So the query belongs here.
 */
export async function readListingSearchDocStats(db: NodePgDatabase<typeof schema>): Promise<{
  docs: number;
  priced: number;
  bookable: number;
}> {
  const { rows } = await db.execute<{ docs: number; priced: number; bookable: number }>(sql`
    select
      count(*)::int as docs,
      count(price_from_minor)::int as priced,
      count(bookable_from)::int as bookable
    from listing_search_doc
  `);

  return rows[0] ?? { docs: 0, priced: 0, bookable: 0 };
}

/**
 * The charters the cards are currently advertising, most-advertised first.
 *
 * The confirming sweep exists to replace a published list rate with the price the vendor
 * itself quotes, and it can only do that for periods it actually asks about. Asking about a
 * fixed grid of Saturdays instead left the sweep and the cards describing different charters:
 * roughly half the NauSYS fleet advertises a week the vendor discounts — 30% and 35% are
 * ordinary — and every card whose week the sweep missed printed the undiscounted list price
 * beside a quote that then came in hundreds of euro lower.
 *
 * Scoped by `best_offer_id`, which is the offer the card is priced from and therefore the
 * vendor whose sweep should cover it. Past periods are excluded: they are what a stale doc
 * advertises, not what anyone can buy.
 *
 * `yachtIds` is the fleet each period actually needs. A vendor priced per hull was being asked
 * about all 7,484 of them for a week 110 of them advertise, which cost the pass its whole
 * clock budget three periods in; see `SweepPeriod.yachtIds`. Null-safe by construction: a doc
 * whose offer carries no source row contributes no id, and a period left with none is one the
 * sweep skips rather than asks blindly.
 */
/**
 * The hulls the standing grid exists for: those whose card advertises no charter at all.
 *
 * The grid is the half of the sweep that guesses, so it is the half that has to guess narrowly.
 * Asked about the whole fleet it re-priced hulls that already advertise a week the targeted
 * half just confirmed -- 7,484 NauSYS hulls against the 493 with nothing to advertise, which
 * at one call per 250 is 30 calls a window instead of 2, and 780 calls instead of 52 across
 * the grid. That is most of a budget spent re-answering an answered question, and it is why a
 * truncated pass never got back to the front of its own list.
 *
 * Narrowing costs nothing this projection can measure: no NauSYS hull holds a confirmed week
 * earlier than the one its card advertises, so the grid was not rescuing dated cards, only the
 * undated ones it is documented to rescue. Scoped by `best_offer_id` for the same reason
 * `listAdvertisedCharterPeriods` is -- the offer the card is priced from is the vendor whose
 * sweep should cover it.
 */
export async function listUnadvertisedYachtIds(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode: string },
): Promise<string[]> {
  const { rows } = await db.execute<{ yachtId: string }>(sql`
    select distinct src.external_yacht_id as "yachtId"
    from listing_search_doc doc
    join listing_offer o on o.id = doc.best_offer_id
    join provider p on p.id = o.provider_id
    join listing_source src on src.id = o.listing_source_id
    where doc.bookable_from is null
      and p.code = ${options.providerCode}
      and src.external_yacht_id is not null
  `);

  return rows.map((row) => row.yachtId);
}

export async function listAdvertisedCharterPeriods(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode: string; limit: number },
): Promise<{ startDate: string; endDate: string; listings: number; yachtIds: string[] }[]> {
  const { rows } = await db.execute<{
    startDate: string;
    endDate: string;
    listings: number;
    yachtIds: string[];
  }>(sql`
    select
      doc.bookable_from as "startDate",
      doc.bookable_to as "endDate",
      count(*)::int as listings,
      coalesce(
        array_agg(distinct src.external_yacht_id) filter (where src.external_yacht_id is not null),
        '{}'
      ) as "yachtIds"
    from listing_search_doc doc
    join listing_offer o on o.id = doc.best_offer_id
    join provider p on p.id = o.provider_id
    left join listing_source src on src.id = o.listing_source_id
    where doc.bookable_from is not null
      and doc.bookable_from >= current_date
      and p.code = ${options.providerCode}
    group by doc.bookable_from, doc.bookable_to
    order by count(*) desc, doc.bookable_from asc
    limit ${options.limit}
  `);

  return rows;
}

export function rebuildListingSearchDocsForListings(
  db: NodePgDatabase<typeof schema>,
  listingIds: readonly string[],
) {
  return rebuildListingSearchDocs(db, { listingIds });
}

export async function rebuildSearchReadModelsAfterSync(
  db: NodePgDatabase<typeof schema>,
  options: RebuildListingSearchDocsOptions = {},
) {
  await rebuildListingSearchDocs(db, options);
}

/**
 * A provider sync deliberately never publishes what it creates — see the
 * comment in packages/providers/src/sync/catalogue-writer.ts — and this file's
 * own rebuild only picks up `status = 'published'` listings, so a freshly
 * synced catalogue stays invisible to search until something publishes it.
 *
 * Publishes every listing still in draft and rebuilds their search docs in one
 * call, so a caller can't publish without also refreshing the read model. No
 * review criteria: fine for an environment with no moderation queue yet; a real
 * one needs actual review before this runs unattended.
 *
 * `providerCode` narrows it to one provider's drafts. Without it, an operator
 * publishing a reviewed NauSYS import would also release every unreviewed
 * Booking Manager draft sitting beside it, which is precisely what the
 * draft-by-default rule exists to prevent.
 */
export async function publishDraftListings(
  db: NodePgDatabase<typeof schema>,
  options: { providerCode?: string } = {},
): Promise<{ publishedCount: number }> {
  const ofProvider = options.providerCode
    ? sql`exists (
        select 1 from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        join provider p on p.id = pr.provider_id
        where ls.listing_id = ${listing.id} and p.code = ${options.providerCode}
      )`
    : undefined;

  const published = await db
    .update(listing)
    .set({ status: "published" })
    .where(ofProvider ? and(eq(listing.status, "draft"), ofProvider) : eq(listing.status, "draft"))
    .returning({ id: listing.id });

  if (published.length > 0) {
    await rebuildListingSearchDocs(db, { listingIds: published.map((row) => row.id) });
  }

  return { publishedCount: published.length };
}

export async function resolveListingIdsForListingSources(
  db: NodePgDatabase<typeof schema>,
  listingSourceIds: readonly string[],
): Promise<string[]> {
  const sourceIds = uniqueIds(listingSourceIds);
  if (sourceIds.length === 0) return [];

  const rows = await db.execute<{ listingId: string }>(sql`
    select distinct listing_id as "listingId"
    from listing_source
    where id in (${sql.join(
      sourceIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      and listing_id is not null
  `);

  return rows.rows.map((row) => row.listingId);
}

function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids?.filter(Boolean) ?? [])];
}

function listingScope(column: SQL, listingIds: readonly string[] | undefined) {
  if (!listingIds) return sql`true`;
  return sql`${column} in (${sql.join(
    listingIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}
