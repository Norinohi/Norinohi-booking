---
status: accepted
---

# Availability is a set of constraints, not an enumeration of offers

Providers publish **occupancy** — the periods a yacht is already sold. Nothing tells us what is
free. `availability_slot` used to answer that by synthesis: walk the listing's `listing_checkin_rule`
across the horizon, drop every candidate that overlaps a booking, and write what survived as
`status = 'available'`. Those rows were a guess wearing the costume of an offer, and everything
downstream inherited the costume.

The guess was also lossy in one direction nobody had noticed. `synthesizeAvailableSlots` advanced
`start = addDays(start, 7)` unconditionally, whatever the rule said. A listing selling any three
nights from any day was therefore published as three-night blocks once a week: roughly 360 legal
start dates collapsed to 52, and every period in between was unreachable. Five listings in the
fleet are flexible in this way and all five were misrepresented.

**Availability is now stored as the constraints the provider actually stated, and whether a
particular charter is legal is computed, not looked up.**

Three tables carry it:

- `availability_slot` — occupancy (`occupied` / `option` / `blocked`) and the vendor's confirmed,
  priced offers. Every row is something the provider said.
- `listing_free_period` — the complement of occupancy inside the fetched horizon. Asserts no start
  day, no length and no price: only that nothing is sold between two dates.
- `listing_price_period` — the provider's published rates, as the periods it published them for.

`packages/api/src/lib/availability-rules.ts` decides a range against those, plus
`listing_checkin_rule`. It is pure, so it runs on either side of the wire and is unit-tested against
the four rule shapes the fleet actually publishes. `availability.constraints` exposes the inputs;
the calendar in the booking sidebar consumes them; `availability.quote` remains the only authority.

## Considered options

- **Keep synthesising, but step by one day instead of seven.** Rejected: it fixes the arithmetic
  and keeps the category error. The rows would still claim the provider had offered periods it was
  never asked about, and the count would grow by roughly 7x for no gain in truth.
- **Enumerate every legal period exhaustively.** Rejected: for a one-night-minimum listing over a
  twelve-month horizon that is tens of thousands of rows per boat, all of them derived, all of them
  invalidated by a single new booking.
- **Ask the provider per candidate range.** Rejected as the default. NauSYS answers arbitrary ranges
  (`readFreeYacht` takes any check-in/check-out pair, which is what makes free-range selection
  possible at all), but it allows one request at a time. A calendar cannot call it per hover. It
  stays where it already was: the quote.
- **Push check-in rules into search.** Rejected. See the consequence below.

## Consequences

- **Search deliberately applies no shape rules.** It answers "is this boat free then" by
  containment against a free period, and the rules settle the exact charter later. Filtering by
  check-in weekday in search would drop a listing because the visitor's dates start on a Tuesday,
  when the honest answer is "free that week, and it starts on Saturdays".
- **This fixed a live search bug.** The old filter required a single `availability_slot` row to span
  the entire requested range, and no synthesized slot ran past eight nights, so every multi-week
  search returned nothing at all. A 14-night stay from 10 October 2026 matched **0** listings while
  **79** had the consecutive weeks free.
- **The card's "from" price changed source.** It was `min(price_minor)` over available slots, so it
  depended on where the calendar had been cut and vanished where the cut missed. It is now the
  cheapest published weekly rate: 109 of 109 listings carry one, where 8 did not.
- **`has_unconfirmed_availability` changed meaning slightly.** It was "some available slot is not
  vendor-confirmed"; it is now "some free period is not covered by a confirmed offer". The filter it
  backs behaves the same, and the column name still describes it.
- **Free periods are written per year, and only for years whose occupancy dump arrived whole.** The
  sync already refuses to sweep a year whose fetch failed; the same guard gates these writes.
  Without it a failed fetch would advertise a boat as free on the strength of not having looked.
- **The absence of a rate is load-bearing.** A provider does not price a season it has not opened,
  so a date no `listing_price_period` covers is not sellable. Every 2027 date is in this state
  today: free, unpriced, and correctly unbookable.
- **Only weekly rates are stored.** The NauSYS loader maps `WEEKLY` price lists and drops `DAILY`
  ones upstream. `listing_price_period.kind` exists so the two can never be folded together — a
  weekly rate is not seven daily rates — but daily pricing is still a gap.
- **`max_nights` is null on all 109 listings.** Either NauSYS does not publish it or the mapper
  drops it. Until that is resolved the calendar cannot cap a range from above.
- **`listing_free_period` uses two `date` columns, not a `daterange` + GiST.** Containment is a
  range scan on `(listing_id, start_date, end_date)`, which is an index probe over a handful of rows
  per listing at this fleet size. `daterange` is the textbook answer and is worth revisiting when
  that stops being true.
