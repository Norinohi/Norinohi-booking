---
status: accepted
---

# A listing is one yacht; what it costs is one offer per provider

The same hull is published by both NauSYS and Booking Manager. The catalogue already modelled
that as one `listing` with several `listing_source` rows, and a reviewer merged the pairs by
hand. But everything the customer is actually sold — the calendar, the rates, the deposit, the
extras, the check-in rules, the prose — hung off the listing, keyed on `(listing_id, dates)`
with no room for a second vendor.

So a confirmed merge did not keep both providers. It kept whichever one synced last:

- `availability_slot`, `listing_price_period`, `listing_free_period` and
  `listing_refused_period` collided week by week and overwrote each other.
- `listing_free_period` and `listing_refused_period` were **deleted by listing**, so one
  vendor's run erased the other's free periods outright and the boat read as sold for the year.
- `listing_text`, `listing_amenity`, `listing_checkin_rule` and `listing_one_way_rule` had no
  source column at all and were replaced per listing every night. Check-in rules are booking
  terms, and the calendar reads them.
- `listing.primary_source_id` was re-pointed at the running provider on every run, while
  `provider-routing.ts` read it as "the merge decision a human made". The merge never wrote it.
- The quote picked one adapter from the listing **before any dates were known**, so the second
  vendor's price and availability were never consulted.

**Everything commercial now hangs off `listing_offer`: one row per (listing, provider source).
The listing is the yacht. An offer is a way to buy it.**

## Considered options

- **Fold the offer into `listing_source`.** Rejected. That table is the identity link the
  duplicate queue decides on, and `listing_duplicate_candidate` points at it. It also has a
  nullable `listing_id` by design — a source can exist attached to nothing — so it cannot carry
  `unique (listing_id, provider_id)`, which is the constraint that stops one vendor's two
  records bidding against each other under a cheapest-wins rule.
- **Add `listing_source_id` to the existing unique keys and leave everything else alone.**
  Rejected. It fixes the collisions and nothing else: the commercial scalars
  (`default_currency`, `payment_policy`, the security deposit, `crew_type`) would still be
  single-valued on `listing`, and an offer has lifecycle an identity link does not — whether we
  still sell it, and three independent freshness stamps for three separately scheduled syncs.
- **One listing per provider record, no merging at all.** Rejected: the customer would see the
  same physical yacht twice, which is the thing the client asked us to stop doing.

## Consequences

- **Two vendors can both write in full and neither erases the other.** Each sync writes only its
  own offer; `canonical-listing.ts` composes `listing` and `listing_specification` from all of
  them by the precedence in backend-architecture §3. One writer, nothing left to fight over.
- **The card is one offer's, end to end.** `listing_search_doc` is still one row per listing,
  but its price, currency, bookable dates, deposit and terms come from the winning offer, so a
  card can no longer price one vendor's week beside another vendor's dates. Availability is the
  union: the boat is free if any vendor says so.
- **The quote asks everybody.** Offers whose own published constraints refuse the range are
  never put to their vendor, which is what stops quoting doubling both providers' call volume.
  A vendor that errors or times out costs itself the sale rather than costing the customer the
  boat. `quote_offer_attempt` records who was asked and what they said, because otherwise "we
  showed the cheaper price" is a claim nobody can check, and a marketplace quietly falling back
  to one vendor looks exactly like one genuinely quoting two.
- **Comparison is on the all-in total, not the rate.** The same hull is quoted 4,600 by one
  vendor and 5,000 by the other with a mandatory fee that reverses the order.
- **Currencies are not converted.** Where two offers quote different money the comparison
  narrows to the listing's own currency, and where none of them quote it price is abandoned and
  the preference order decides. A number neither vendor agreed to is worse than no comparison.
- **Constraints are per offer on the wire.** `availability.constraints` returns one set per
  offer and `offer-availability.ts` combines them; `availability-rules.ts` stays untouched and
  pure, because a single constraint set is exactly one vendor's answer.
- **Same-provider fuzzy matching is gone.** It matched on `company|base|model|year|name`, and
  Booking Manager publishes no per-hull name — its `name` is the product line, "Moorings
  4200/3/3 Exclusive" — so the tuple was identical across a whole fleet at one base. It fused
  486 records onto 172 listings and, because prices and calendars were keyed by listing,
  overwrote 314 boats into invisibility. A vendor's id space is the identity now; anything that
  really is one boat twice is a duplicate for a human to confirm.
- **`listing.status` gained `merged`.** A listing whose offers have all moved elsewhere is not
  hidden — it holds no inventory any more — and `merged_into_listing_id` lets its old URL
  redirect to the survivor.
- **There is no database test harness**, so the pure decisions (`resolveFields`, `pickWinner`,
  the availability combinators) are unit-tested and the shape of the data is checked by
  `pnpm --filter @yacht-charter/providers offers:verify`, which is meant to gate a deploy.
