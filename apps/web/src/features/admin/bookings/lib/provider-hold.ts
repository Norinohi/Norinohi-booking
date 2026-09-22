/*
 * The vendor's last word, when it is one that means the boat is still theirs to give back.
 * `cancelled` and a null (a provider that was never asked) are the other side of this.
 *
 * The booking chain writes our canonical words and the reservation reconcile the vendor's own,
 * which for both vendors are `OPTION` and `RESERVATION`. Booking Manager's `OPTION_EXPIRED`
 * belongs here too: it keeps the week blocked until the record is deleted.
 */
const PROVIDER_HOLDS = ["confirmed", "option_held", "OPTION", "RESERVATION", "OPTION_EXPIRED"];

/*
 * Statuses that say we let the slot go. Cancelling a CONFIRMED booking lands at REFUND_PENDING
 * rather than CANCELLED, so both belong here: the pair with a provider that still holds is
 * exactly the case where money is about to be returned on a charter we are still billed for.
 */
const RELEASED_BY_US = ["CANCELLED", "REFUND_PENDING"];

/** A booking we let go whose provider, by its last word, still holds the boat for us. */
export function providerStillHolds(status: string, providerStatus: string | null): boolean {
  return (
    RELEASED_BY_US.includes(status) &&
    providerStatus !== null &&
    PROVIDER_HOLDS.includes(providerStatus)
  );
}
