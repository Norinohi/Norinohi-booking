# Domain overview (plain language)

A plain-words explanation of what this app is and what the main tables are for. For the precise model, field lists, and decisions, see [`backend-architecture.md`](./backend-architecture.md).

## Who actually has an account

Two kinds of people log in:

- **Customers.** They search, save yachts to a wishlist, and book. This is the existing `user`/auth setup plus a `profile`.
- **Us, the internal staff** (a `role` on a user). We don't book anything. We adjust prices and clean up imported data.

Charter companies do not get accounts. They don't log in, they don't upload their own yachts, and we don't deal with yacht owners at all. A company in our database is just a name and some details we imported, so a yacht page can say "run by X." It's a label, not a user.

## What NauSYS and Booking Manager are for, if we store everything anyway

We don't own any boats and we don't hold the real inventory. We're a shop that resells other people's boats. NauSYS and Booking Manager are the two warehouses behind us. Between them they list around twelve thousand yachts from over a thousand charter companies, with photos, specs, prices, and live availability.

We keep our own copy of that data for three practical reasons:

1. **Speed.** We can't call NauSYS every time someone types in the search box or opens a yacht page. It's slow and they cap how often we can ask. So we import their catalogue (yachts, photos, specs, companies, marinas) into our database on a schedule and serve our pages from that copy.
2. **Our own clean version.** The same boat often appears in both NauSYS and Booking Manager with different photos and sometimes different data. We merge those into one listing, keep the better photos, and add our own layer like a price override.
3. **The parts that are genuinely ours.** Accounts, the wishlist, payments through Stripe, and our price rules never existed in NauSYS. Those live only with us.

The part that matters most: a few things change too fast to trust a stored copy. Whether this exact week is still free, and what the final price is today with deposit and extras. We never rely on our copy for those. At the moment someone asks for a quote or tries to book, we call NauSYS or Booking Manager live. And the booking itself goes through their API: they create the real reservation with the charter company, and we just record our copy of it.

So NauSYS is the source of truth for availability, the current price, and the actual reservation. Our tables are a fast local copy for browsing, plus everything that belongs to us.

## The main entities, grouped by job

### The yacht as a customer sees it
- `listing`: one yacht, our version. The thing people browse and book.
- `listing_specification`: its details like length, cabins, berths, year.
- `listing_media`: its photos, in order.
- `listing_amenity`: what's on board (wifi, a skipper, extra gear). Some included, some paid.
- `listing_checkin_rule`, `listing_one_way_rule`: which days a charter can start and end, minimum length, one-way trips.
- `review`, `faq`: the text on the yacht page.

### Where it is and who runs it
- `operator`: the charter company running the yacht. Display only, no login.
- `country`, `region`, `location`, `base`: where you collect the boat, from country down to the marina.
- `builder`, `yacht_model`, `yacht_category`: the make, the model, and the type.

### Where the data came from (the import plumbing)
- `provider`: which outside system a record came from, NauSYS or Booking Manager.
- `provider_record`: one raw entry from a provider (their version of a yacht, a company, a marina), kept with their own ID.
- `provider_raw_payload`: the exact untouched data they sent, saved so we can recheck or reimport.
- `listing_source`: the link saying "this provider's yacht is the same as this listing of ours." One listing can have two sources when the same boat comes from both.
- `listing_duplicate_candidate`: a "these two look like the same boat, please confirm" note.
- `sync_run`, `sync_error`: a log of each import and anything that broke.

### The people
- `user`: a customer, or a staff member marked by a role.
- `profile`: extra details about a user.
- `wishlist`: yachts a user saved.
- `referral`: invite-a-friend.

### Booking and money (next milestones)
- `quote`: a firm price for exact dates and guests, frozen for a short window.
- `booking`: a real reservation, with a status as it moves from held to paid to confirmed.
- `payment`, `payment_schedule`: the money through Stripe, deposit now and balance later.

### Our internal controls
- `price_adjustment_rule`: the "manage price" tool. Raise or lower a provider's price for one yacht or a group, over a chosen period.
- `audit_log`: who changed what.

## One-line version

Customers browse and book on our site, we tune prices and tidy the data, and the yachts, live prices, and real reservations all come from NauSYS and Booking Manager while we keep a fast local copy of everything except availability and the final price, which we always confirm with them at booking time.
