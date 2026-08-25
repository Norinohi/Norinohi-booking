Subject: Re: Booking Manager REST API, remaining integration questions from Norinohi

Dear Diego,

Thank you. I have attached a short booking-lifecycle addendum from our latest tests against
charter test company 225. It answers my earlier `finalPrice` / `clientPrice` question and
also documents option expiry, `agencyPaymentPlan`, and the two reservation records we see
for one booking.

One correction for the API specification: `DELETE /reservation/{id}` does not remove an
option. In our tests it moved the reservation to `status 5`, and repeat calls were
idempotent. Could you please confirm that `5 = cancelled`?

I would also appreciate your help with these points:

1. After `POST /requests` with `type: 1`, who approves the cancellation request and how can
   we read the outcome through the API? The request I filed on 2026-08-25 returned 200, but
   both reservation records still read as `status: 1`, and a retry returned a generic 400.
   We need a reliable way to show guests whether cancellation is possible, what it costs,
   and whether a request already exists.

2. What response time and request rate should we design for? Most `/offers` calls are fast
   enough, but I also measured first-run responses up to almost 30 seconds. Is there an
   expected warm-up cost, documented rate limit, or recommended concurrency for live quote
   requests?

3. Is `/objects/{entity}/search/` the intended API for incremental catalogue sync? If so,
   can `Resource` access be granted for our key, and is `lastSyncPoint` guaranteed to be
   monotonic and to include deletions? If not, we will continue walking companies nightly.

There are two smaller catalogue questions as well:

- For a percentage extra (`kind: 0`), what is the percentage applied to: the charter price,
  or the charter price plus obligatory extras?
- Is disappearance from a nightly sync the intended signal that a company or yacht should
  be deactivated, or can an explicit active/deleted flag be exposed?

Finally, please confirm or correct these assumptions:

- `commissionValue` is computed on the VAT-exclusive base, while `price` is VAT-inclusive.
- Reservation status `11` blocks the boat; we should treat unknown statuses as blocking.
- There is no webhook or push mechanism, so polling is expected.
- Optional extras cannot be attached through the API.
- Licence verification stays with the base, and `crewListLink` is only for collecting guest
  details.

Written answers would be ideal, because these points map directly to integration rules.

Best regards
