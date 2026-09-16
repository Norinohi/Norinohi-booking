import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema";
import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { shiftDays, todayUtc } from "./candidate-range";
import { MIN_LEAD_DAYS } from "./read-model";
import { overlapsSlotHold, slotHoldsAsOccupancy } from "./slot-holds";
import type {
  AvailabilityCalendar,
  AvailabilityCalendarInput,
  AvailabilityConstraints,
} from "./types";

export async function listAvailabilityCalendar(
  db: NodePgDatabase<typeof schema>,
  input: AvailabilityCalendarInput,
): Promise<AvailabilityCalendar> {
  const rows = await db.execute<{
    startDate: string;
    endDate: string;
    status: "available" | "option" | "occupied" | "blocked";
    priceMinor: number | null;
    currency: string | null;
    minNights: number | null;
    checkinWeekday: number | null;
    checkoutWeekday: number | null;
    availabilityConfirmed: boolean;
  }>(sql`
    select
      slot.start_date as "startDate",
      slot.end_date as "endDate",
      slot.status,
      slot.price_minor as "priceMinor",
      slot.currency,
      slot.min_nights as "minNights",
      slot.checkin_weekday as "checkinWeekday",
      slot.checkout_weekday as "checkoutWeekday",
      slot.availability_confirmed as "availabilityConfirmed"
    from availability_slot slot
    where slot.listing_id = ${input.listingId}
      and slot.start_date >= ${input.from}
      and slot.end_date <= ${input.to}
      /*
       * Only the offers. A row the provider already marks taken is reported as it stands,
       * but one it still offers and we have since sold is not something to list back.
       */
      and (
        slot.status <> 'available'
        or not ${overlapsSlotHold(sql`slot.listing_id`, sql`slot.start_date`, sql`slot.end_date`)}
      )
    order by slot.start_date asc, slot.end_date asc
  `);

  return {
    listingId: input.listingId,
    slots: rows.rows.map((slot) => ({
      startDate: slot.startDate,
      endDate: slot.endDate,
      status: slot.status,
      price:
        slot.priceMinor !== null && slot.currency
          ? { amountMinor: slot.priceMinor, currency: slot.currency }
          : undefined,
      minNights: slot.minNights,
      checkinWeekday: slot.checkinWeekday,
      checkoutWeekday: slot.checkoutWeekday,
      availabilityConfirmed: slot.availabilityConfirmed,
    })),
  };
}

export async function listAvailabilityConstraints(
  db: NodePgDatabase<typeof schema>,
  input: AvailabilityCalendarInput,
): Promise<AvailabilityConstraints> {
  /*
   * One constraint set per offer, never one per listing.
   *
   * A yacht two vendors sell has two calendars, two rate lists and two sets of check-in
   * rules, and flattening them describes a charter neither would honour: one vendor's free
   * week closed on the other vendor's turnaround day. `offer-availability.ts` combines the
   * answers instead, so the sets stay whole and the customer still sees one card.
   */
  /*
   * Overlap, not containment, unlike the calendar above. A booking that starts before
   * the window and ends inside it still blocks candidate ranges at this end, and a
   * containment filter would drop it and let the caller offer a period that is taken.
   */
  const overlapsWindow = sql`slot.start_date < ${input.to} and slot.end_date > ${input.from}`;

  const [offers, rules, occupied, priced, refused, oneWay, holds] = await Promise.all([
    db.execute<{ offerId: string; provider: string }>(sql`
      select o.id as "offerId", p.code as provider
      from listing_offer o
      join provider p on p.id = o.provider_id
      where o.listing_id = ${input.listingId} and o.status = 'active'
      order by o.id
    `),
    db.execute<{
      offerId: string;
      checkinWeekday: number | null;
      checkoutWeekday: number | null;
      minNights: number | null;
      maxNights: number | null;
      seasonStart: string | null;
      seasonEnd: string | null;
    }>(sql`
      select
        rule.listing_offer_id as "offerId",
        rule.checkin_weekday as "checkinWeekday",
        rule.checkout_weekday as "checkoutWeekday",
        rule.min_nights as "minNights",
        rule.max_nights as "maxNights",
        rule.season_start as "seasonStart",
        rule.season_end as "seasonEnd"
      from listing_checkin_rule rule
      join listing_offer o
        on o.id = rule.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      order by rule.min_nights asc nulls first, rule.checkin_weekday asc nulls first
    `),
    db.execute<{
      offerId: string;
      startDate: string;
      endDate: string;
      status: "option" | "occupied" | "blocked";
    }>(sql`
      /* Cast to text for the same reason the union below does: an enum has no common type with a case. */
      select
        slot.listing_offer_id as "offerId",
        slot.start_date as "startDate",
        slot.end_date as "endDate",
        slot.status::text as status
      from availability_slot slot
      join listing_offer o
        on o.id = slot.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      where slot.status <> 'available'
        and ${overlapsWindow}
      order by "startDate" asc
    `),
    db.execute<{
      offerId: string;
      startDate: string;
      endDate: string;
      priceMinor: number;
      currency: string;
      confirmed: boolean;
      exact: boolean;
    }>(sql`
      /*
       * The provider's published rates, which is what makes a date sellable at all: it does
       * not publish one for a season it has not opened. Read from the rate list rather than
       * from priced slots, so the signal covers the season the provider actually priced
       * instead of only the periods someone enumerated inside it.
       */
      select
        price.listing_offer_id as "offerId",
        price.start_date as "startDate",
        price.end_date as "endDate",
        price.price_minor as "priceMinor",
        price.currency,
        exists (
          select 1
          from availability_slot slot
          where slot.listing_offer_id = price.listing_offer_id
            and slot.status = 'available'
            and slot.availability_confirmed
            and slot.start_date >= price.start_date
            and slot.end_date <= price.end_date
        ) as "confirmed",
        false as "exact"
      from listing_price_period price
      join listing_offer o
        on o.id = price.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      /*
       * Every currency the offer publishes in, not just the caller's. This list opens a season;
       * it does not price one, and a Bahamas fleet quoting in USD has a season all the same.
       * Filtering it by the caller's currency returned nothing for those offers, which read as
       * season-closed on every day and greyed out a calendar the search card was still
       * advertising dates from -- 190 listings with a live charter and a dead date picker.
       */
      where price.kind = 'weekly'
        and price.start_date < ${input.to}
        and price.end_date > ${input.from}

      union all

      /*
       * A week the vendor itself priced opens its season as surely as a published rate does --
       * more surely, since it is an answer about this exact charter rather than a band the
       * season was cut into. Without it the rate list alone decided, and a confirming sweep
       * that had just been told a price for a week outside every published band still read as
       * a season nobody had opened: the calendar greyed it out and the card could not offer it.
       */
      select
        slot.listing_offer_id as "offerId",
        slot.start_date as "startDate",
        slot.end_date as "endDate",
        slot.price_minor as "priceMinor",
        slot.currency,
        true as "confirmed",
        true as "exact"
      from availability_slot slot
      join listing_offer o
        on o.id = slot.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      where slot.availability_confirmed
        and slot.status = 'available'
        and slot.price_minor is not null
        and slot.currency is not null
        and slot.start_date < ${input.to}
        and slot.end_date > ${input.from}
      order by "startDate" asc
    `),
    db.execute<{ offerId: string; startDate: string; endDate: string }>(sql`
      /*
       * Exact periods the provider was asked to price and declined, which occupancy and the
       * rate list cannot express between them: a week can be unsold, in an open season, and
       * still refused. Overlap, not containment, only to bound the read - the caller matches
       * these on both ends, because a refused fortnight says nothing about the free week
       * starting the same day.
       */
      select r.listing_offer_id as "offerId", r.start_date as "startDate", r.end_date as "endDate"
      from listing_refused_period r
      join listing_offer o
        on o.id = r.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      where r.start_date < ${input.to}
        and r.end_date > ${input.from}
        /* Only refusals something has re-confirmed lately; see REFUSAL_TRUST_DAYS. */
        and r.updated_at > now() - make_interval(days => ${REFUSAL_TRUST_DAYS})
      order by r.start_date asc
    `),
    db.execute<{
      offerId: string;
      startDate: string | null;
      endDate: string | null;
      isOneWay: boolean;
    }>(sql`
      select
        rule.listing_offer_id as "offerId",
        rule.start_date as "startDate",
        rule.end_date as "endDate",
        rule.is_one_way as "isOneWay"
      from listing_one_way_rule rule
      join listing_offer o
        on o.id = rule.listing_offer_id
       and o.listing_id = ${input.listingId}
       and o.status = 'active'
      where (rule.start_date is null or rule.start_date < ${input.to})
        and (rule.end_date is null or rule.end_date > ${input.from})
      order by rule.start_date asc nulls first
    `),
    /*
     * Our own live checkouts, which belong to the hull rather than to a seller: a hold taken
     * through one vendor blocks the boat whoever else lists it. Appended to every offer.
     */
    db.execute<{
      startDate: string;
      endDate: string;
      status: "option" | "occupied" | "blocked";
    }>(sql`
      select "startDate", "endDate", status from (
        ${slotHoldsAsOccupancy(input.listingId, input.from, input.to)}
      ) held
    `),
  ]);

  const byOffer = <T extends { offerId: string }>(rows: readonly T[]) => {
    const grouped = new Map<string, Omit<T, "offerId">[]>();
    for (const { offerId, ...rest } of rows) {
      grouped.set(offerId, [...(grouped.get(offerId) ?? []), rest]);
    }
    return grouped;
  };

  const rulesByOffer = byOffer(rules.rows);
  const occupiedByOffer = byOffer(occupied.rows);
  const pricedByOffer = byOffer(priced.rows.map(({ exact: _exact, ...row }) => row));
  /*
   * The exact charters the vendor priced as free, which `rangeStatus` lets outrank the rules.
   * Read off the confirmed rows above rather than queried again: they are the same slots.
   */
  const confirmedByOffer = byOffer(
    priced.rows
      .filter((row) => row.exact && row.startDate >= shiftDays(todayUtc(), MIN_LEAD_DAYS))
      .map(({ offerId, startDate, endDate }) => ({ offerId, startDate, endDate })),
  );
  const refusedByOffer = byOffer(refused.rows);
  const oneWayByOffer = byOffer(oneWay.rows);

  return {
    listingId: input.listingId,
    window: { from: input.from, to: input.to },
    offers: offers.rows.map((offer) => ({
      offerId: offer.offerId,
      provider: offer.provider,
      rules: rulesByOffer.get(offer.offerId) ?? [],
      occupied: [...(occupiedByOffer.get(offer.offerId) ?? []), ...holds.rows],
      priced: pricedByOffer.get(offer.offerId) ?? [],
      confirmed: confirmedByOffer.get(offer.offerId) ?? [],
      refused: refusedByOffer.get(offer.offerId) ?? [],
      oneWay: oneWayByOffer.get(offer.offerId) ?? [],
    })),
  };
}
