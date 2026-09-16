import { sql, type SQL } from "drizzle-orm";

import { REFUSAL_TRUST_DAYS } from "../schema/availability";
import { listableOffer, requiresOperatorConfirmation } from "../sellable-offer";
import { EARLIEST_CHECKIN } from "./lead-time";

/*
 * Which vendor takes a tie, read from the admin setting so the card and the sale agree.
 *
 * Resolved here rather than passed in, because every caller of this rebuild would
 * otherwise have to carry a value none of them has an opinion about. The consequence is
 * that a change of preference reaches the catalogue only when these documents are next
 * rebuilt -- the sale and the availability calendar follow it immediately.
 *
 * array_position is 1-based and answers NULL for a code the list does not name, which
 * is the ranking we want: a provider nobody has configured sorts after every one who is.
 */
export function providerRank(): SQL {
  return sql`
        coalesce(
          array_position(
            coalesce(
              (select ms.transacting_preference from marketplace_setting ms where ms.id = 'singleton'),
              array['booking_manager', 'nausys', 'mock']
            ),
            p.code
          ),
          1000
        )
  `;
}

/**
 * A vendor-confirmed, priced slot the catalogue may advertise, as a predicate on `slot` for the
 * offer `o`. Shared by the bookable-week pick and the per-period prices, so a week the one
 * refuses is never priced by the other.
 */
export function sellableConfirmedSlot(): SQL {
  return sql`
          slot.availability_confirmed
          and slot.status = 'available'
          and slot.price_minor is not null
          and slot.start_date >= ${EARLIEST_CHECKIN}
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
          /*
           * No check-in rule test either. The vendor's answer outranks our transcription of its
           * rules, as it does in rangeStatus, which lets a confirmed charter through on the
           * same terms: one Booking Manager operator lists Monday and Friday and sells every
           * weekday, and 11,700 weeks it priced were dropped here on the check-in day.
           */
  `;
}

/** An offer the catalogue may sell, as a predicate on `o`. */
export function sellableActiveOffer(): SQL {
  return sql`
      o.status = 'active'
        /*
         * A hull the operator has retired. Dropped here rather than deleted, because a charter
         * already booked on it still has to be readable. An operator that confirms bookings by
         * hand stays in: its boats are shown and priced, and only checkout withholds them.
         */
        and ${listableOffer({ outOfFleetDate: sql`o.out_of_fleet_date` })}
  `;
}

/* Whether offer o needs its operator to confirm, which ranks it behind one that books online. */
export function operatorConfirms(): SQL {
  return requiresOperatorConfirmation({
    optionApprovalRequired: sql`o.option_approval_required`,
    fixedBookingSupported: sql`o.fixed_booking_supported`,
  });
}
