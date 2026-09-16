import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * The three columns that decide whether an offer may be sold at all.
 *
 * Passed as references rather than read off the table, because the two callers name them
 * differently: the search read model is raw SQL over an aliased `listing_offer`, and offer
 * selection is a Drizzle query over the table itself.
 */
export interface SellabilityColumns {
  outOfFleetDate: SQLWrapper;
  optionApprovalRequired: SQLWrapper;
  fixedBookingSupported: SQLWrapper;
}

/**
 * Whether we may put this offer in front of a customer.
 *
 * One expression, two call sites, because the two of them disagreeing is the failure this is
 * for: the rule lived only in the search document, so a hull the vendor will not let us sell
 * was missing from search and still quotable from its own page -- and the hold at the end of
 * that checkout came back OPERATION_NOT_ALLOWED with the guest details already filled in.
 *
 * - `out_of_fleet_date` is the day the operator retires the hull. It stays in the catalogue
 *   dump afterwards, so nothing about the sync notices; it simply cannot be chartered.
 * - The two booking flags are NauSYS's `needsOptionApproval` and `canMakeBookingFixed`. Null is
 *   "the vendor does not say", which is every Booking Manager offer, so only an explicit
 *   refusal withholds the boat.
 *
 * Nothing is deleted by any of this. A charter already booked on such a hull still has to be
 * readable, and a boat withheld today is sellable again the moment the operator says so.
 */
export function sellableOffer(columns: SellabilityColumns): SQL {
  return sql`(
    ${listableOffer(columns)}
    and not ${requiresOperatorConfirmation(columns)}
  )`;
}

/**
 * Whether the offer belongs in the catalogue at all, with its dates and prices.
 *
 * Only a retired hull is left out. One whose operator confirms each booking by hand is still
 * for sale, just not online: NauSYS answered `FREE` with a price for all 24 such yachts asked
 * in Sep 2026, and the API reference defines the two flags as the operator approving the option
 * and the operator fixing the booking. So those boats are shown, quoted and taken as a booking
 * request, and only checkout withholds them; see `requiresOperatorConfirmation`.
 */
export function listableOffer(columns: Pick<SellabilityColumns, "outOfFleetDate">): SQL {
  return sql`(${columns.outOfFleetDate} is null or ${columns.outOfFleetDate} > current_date)`;
}

/**
 * The operator confirms this charter by hand, so it cannot be held and paid for online.
 *
 * NauSYS `needsOptionApproval`: "if created option needs to be approved by charter company".
 * `canMakeBookingFixed` false: the charter company converts the option into a reservation, not
 * the agency (API v6 reference, `RestYacht`). Null on either is the vendor saying nothing.
 */
export function requiresOperatorConfirmation(
  columns: Pick<SellabilityColumns, "optionApprovalRequired" | "fixedBookingSupported">,
): SQL {
  return sql`(
    ${columns.optionApprovalRequired} is true
    or ${columns.fixedBookingSupported} is false
  )`;
}
