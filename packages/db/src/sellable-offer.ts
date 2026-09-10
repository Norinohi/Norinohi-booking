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
    (${columns.outOfFleetDate} is null or ${columns.outOfFleetDate} > current_date)
    and ${columns.optionApprovalRequired} is not true
    and ${columns.fixedBookingSupported} is not false
  )`;
}
