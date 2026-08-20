import { sql, type SQL } from "drizzle-orm";

import { SLOT_HOLDING_STATUSES } from "../schema/booking";

/**
 * The periods our own live bookings hold, subtracted from cached availability at read time.
 *
 * `availability_slot` and `listing_free_period` are written only by the hourly availability
 * sync and hold only what the provider stated (docs/adr/0004). A checkout that has just taken
 * an option at the vendor is therefore invisible to our own tables for up to a sync cycle, and
 * search keeps offering the period until the vendor tells us back what we already know.
 *
 * Read-time rather than written into those tables, for three reasons:
 *
 * - It releases itself. The expiry sweep moves an abandoned checkout out of `OPTION_HELD` and
 *   the dates return with no compensating write. A materialised block needs one on every expiry,
 *   cancellation, rejection and refund path, and the one that gets missed hides a yacht for good.
 * - It cannot be clobbered. The sync deletes and rewrites `listing_free_period` per year and
 *   sweeps `availability_slot` rows it did not see, so a hand-written row is either wiped or,
 *   if it dodges the `listing_source_id` filter, survives as a phantom nobody can explain.
 * - It keeps those tables honest. They mean "what the provider said". Our own pending hold is a
 *   different kind of fact and should not be laundered into them.
 *
 * This narrows what we offer; it never widens it. The vendor remains the authority, and
 * `availability.quote` remains the only thing that decides a charter is real.
 */
const holdingStatuses = sql.join(
  SLOT_HOLDING_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

/** Dates are compared as half-open ranges: a check-out is another charter's legal check-in. */
const overlaps = (from: SQL | string, to: SQL | string) =>
  sql`hold_period.check_in < ${to} and hold_period.check_out > ${from}`;

/**
 * Whether one of our live bookings covers any part of `from`..`to` for `listingId`.
 *
 * `listingId` is a SQL fragment so a caller can pass either a correlated column
 * (`sql\`doc.listing_id\``) or a bound value (`sql\`${input.listingId}\``).
 */
export function overlapsSlotHold(listingId: SQL, from: SQL | string, to: SQL | string): SQL {
  return sql`exists (
    select 1
    from booking hold
    join quote hold_period on hold_period.id = hold.quote_id
    where hold.listing_id = ${listingId}
      and hold.status in (${holdingStatuses})
      and ${overlaps(from, to)}
  )`;
}

/**
 * The same holds as rows, shaped like the occupancy `listAvailabilityConstraints` reads out of
 * `availability_slot`, so the two can be read as one list.
 *
 * A confirmed booking is `occupied` and anything earlier is `option`, which is what those two
 * statuses already mean to the sidebar: one is sold, the other is held by someone mid-checkout
 * and may come back.
 */
export function slotHoldsAsOccupancy(listingId: string, from: string, to: string): SQL {
  return sql`
    select
      hold_period.check_in as "startDate",
      hold_period.check_out as "endDate",
      case when hold.status = 'CONFIRMED' then 'occupied' else 'option' end::text as status
    from booking hold
    join quote hold_period on hold_period.id = hold.quote_id
    where hold.listing_id = ${listingId}
      and hold.status in (${holdingStatuses})
      and ${overlaps(from, to)}
  `;
}
