# YachtSkanner Marketplace

A marketplace where visitors browse charter yachts, check availability, and book them. The web app
is a read-heavy public catalogue in front of a booking flow; the two halves have different
correctness requirements, which the language below makes explicit.

## Language

### The marketplace

**Listing**:
One vessel, as the marketplace knows it: its identity, specification, photographs and home base.
The canonical term in code, and the unit a customer browses and opens. Not the unit that is
priced — see Offer.
_Avoid_: Yacht, boat, charter (as a noun for the thing being sold)

**Offer**:
One provider's sellable proposition for a Listing: its calendar, its rates, its deposit, its
extras and its booking terms. A hull both NauSYS and Booking Manager publish is one Listing with
two Offers, and none of that is merged between them, because two vendors pricing the same week
differently is not a fact about the boat. The customer sees one card carrying the best Offer for
the dates they asked about, and books through the vendor that Offer belongs to.
_Avoid_: Provider listing, source listing (a `listing_source` is the identity link, not the offer)

**Yacht**:
The physical vessel a Listing offers. Also the customer-facing word, so it stays in public URLs
(`/[locale]/yachts/[id]`) and in marketing copy even though the code says Listing. The split is
deliberate: URLs carry the word customers search for, code carries the word the domain models.

**Charter**:
A booked period of use of a Listing — a start instant, an end instant, and a party. A charter time
is the marina's wall clock, not the visitor's.
_Avoid_: Rental, hire, trip

### Data kinds

**Catalog data**:
Data describing what exists in the marketplace — filter facets, search result cards, listing detail,
reviews. It is the same for every visitor and may be served slightly stale without harm.

**Booking-critical data**:
Data describing what is still bookable and what it costs — availability calendars, quotes, and
repriced totals. Serving a stale value here means quoting a price that will not be honoured or a
boat that cannot be delivered, so it is always read at request time.
_Avoid_: "live data", "dynamic data" — those describe the mechanism, not why it matters.
