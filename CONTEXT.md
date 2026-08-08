# Yacht Charter Marketplace

A marketplace where visitors browse charter yachts, check availability, and book them. The web app
is a read-heavy public catalogue in front of a booking flow; the two halves have different
correctness requirements, which the language below makes explicit.

## Language

### The marketplace

**Listing**:
The sellable unit — one vessel offered by one operator, with its own pricing, calendar, and base
location. This is the canonical term in code, and what the database and API model.
_Avoid_: Yacht, boat, charter (as a noun for the thing being sold)

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
