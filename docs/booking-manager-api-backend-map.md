# Booking Manager API v2.2.2 - backend integration map

Source: SwaggerHub `mmksystems/bm-api`, version **2.2.2**. The connector was first
written against 2.1.4; the contract header in `booking-manager/endpoints.ts` is pinned
to 2.2.2 and lists the changelog entries the schemas follow, plus the keys the live
feed sends that the spec does not declare (`includesDepositWaiver`,
`Extras.includedExtras`, `Description.documents`, `Company.rating`). Section 10 is the
endpoint-by-endpoint coverage as of the 2026-09-22 audit against 2.2.2, checked live on
test company 225.

> **Read this before hunting for the spec.** The SwaggerHub _UI_ page for this API is
> login-walled, which reads like "no access" and has already cost one person an
> afternoon. The definition itself is publicly readable without an account at
> `https://api.swaggerhub.com/apis/mmksystems/bm-api/2.2.2`. Fetch that URL, not
> the UI.

> **Canonical model:** [`backend-architecture.md`](./backend-architecture.md) is the authoritative shared vocabulary and data model for both providers. This document is the **Booking Manager connector-specific reference** - it maps Booking Manager endpoints and `Rest*` types onto the canonical names defined there (`listing`, `provider_record`+`listing_source`, `operator`, `amenity`, `booking`, `price_adjustment_rule`, …). Its sibling is [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md); where the two providers disagree, §2 below is the place that says so.

This is an implementation map, not a copy of the vendor specification. It
identifies every documented API area and data-structure family, its purpose, and
how it maps into the marketplace. The connector must keep all provider payloads
and IDs at its boundary; browser-facing oRPC procedures use the canonical
contracts.

## 1. Integration model

Booking Manager (MMK Systems) is a charter distribution platform. We consume it
as an agency. Treat it, like NauSYS, as an external source of truth for provider
inventory, live availability, pricing and the provider reservation lifecycle.

### Rules

1. Never use a Booking Manager numeric ID as a public marketplace identifier.
   Store it in `provider_record.external_id`, unique on
   `(provider, resource_type, external_id)`.
2. Preserve raw request/response payloads for all syncs and booking mutations.
3. Catalogue data is imported to a local read model. Search cards and yacht pages
   must not call Booking Manager directly.
4. Date-specific availability, final price, extras, deposit and payment plan are
   volatile. Revalidate them during quote/option/booking.
5. A Booking Manager listing is not automatically the same yacht as a NauSYS
   listing. Link sources to a canonical listing only after a reviewed match (§7).
6. Provider credentials are server-only secrets. The web client never receives
   provider endpoint URLs, the bearer token, commission fields, agency cost or
   raw provider errors.

### Connectivity

|                     | Value                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Production base URL | `https://www.booking-manager.com/api/v2`                            |
| Beta base URL       | `http://beta.booking-manager.com/api/v2` (plain HTTP, as published) |
| Auth scheme         | HTTP `Bearer` (SwaggerHub security scheme name `bearerAuth`)        |
| Header              | `Authorization: Bearer <token>`                                     |
| Env var             | `BOOKING_MANAGER_API_KEY`                                           |

The token is **not** an API-key header - not `X-API-Key`, not a query parameter.
`packages/providers/src/booking-manager/client.ts` sets a single
`authorization: Bearer …` header on the shared HTTP client and nothing else.

`BOOKING_MANAGER_API_KEY` is optional in the env schema so a missing secret
cannot stop the server booting; `resolveBookingManagerConfig` is the point that
refuses loudly with an `AuthError` when `booking_manager` mode is actually
selected. The queue key is a SHA-256 fingerprint of the token, never the token
itself, because queue keys reach logs and error context.

## 2. Transport shape, and how it differs from NauSYS

This is the section worth reading if you already know the NauSYS connector. The
two vendors disagree on nearly every transport decision, and each disagreement
has already forced a change in shared code.

|             | NauSYS                                             | Booking Manager                                         |
| ----------- | -------------------------------------------------- | ------------------------------------------------------- |
| Errors      | HTTP 200 always; status carried in a body envelope | real HTTP status codes (400 / 401 / 404 / 422)          |
| Method      | POST with a JSON body                              | GET with query parameters (reservation writes excepted) |
| Credentials | username/password repeated in every request body   | `Authorization: Bearer` header                          |
| Yacht specs | hung off the **model**                             | carried on the **yacht**                                |

Consequences already in the code:

- **`shared/http-client.ts` gained a `get()` method.** NauSYS never needed one -
  every call was a POST. Booking Manager's catalogue, availability and pricing
  are all GET with query parameters, so the shared client had to grow query
  serialization rather than the connector hand-rolling URLs.
- **Booking Manager's classifier is the shared status one plus the 400 bodies.**
  NauSYS needs a custom classifier that opens the 200-OK envelope and reads
  `status` / `errorCode` out of the body. Booking Manager's real status codes map
  straight onto the shared taxonomy: 401 → `AuthError`, 404 → `NotFound`, 429/5xx →
  `RateLimited`/`Transient` (retried with backoff), and **422 falls through to
  `ContractError`**, which is correct - an unprocessable obligatory field is a
  payload we got wrong, not something a retry fixes. The one exception is a
  plain-text `400` on `POST /reservation` opening "Yacht is not available":
  `classifyBookingManagerResponse` reads the rest of the sentence into
  `SlotUnavailableError` with `OWN_OPTION_EXISTS` (our own option sits on the slot),
  `PRICE_NOT_DEFINED` (the product or period has no price) or `NOT_AVAILABLE` (the
  week is sold). Only the last one takes the week off the card. Any other plain-text
  4xx keeps the vendor's sentence in the `ContractError` message.
- **Spec location matters for projection.** `length`, `beam`, `cabins` and
  `berths` sit on `restYachtSchema` here. Assuming the NauSYS layout (specs on
  the model) is what made the first NauSYS import drop every listing, so the
  Booking Manager schema carries an explicit comment at that field group. Do not
  share a "spec extractor" across the two connectors.

All response schemas in `booking-manager/endpoints.ts` are deliberately loose
(`z.looseObject`, most fields optional/nullable, numbers coerced) so an additive
vendor change cannot fail a whole catalogue sync. Same posture as
`nausys/endpoints.ts`.

Calls are serialized through a `SequentialQueue` keyed by the credential
fingerprint, with `BOOKING_MANAGER_MIN_INTERVAL_MS` (default 250 ms) spacing.
Booking Manager has published no rate limit (§9), but MMK support stated one
concurrency rule on 2026-08-25: at most 20 calls in flight per account, and past
that the key is blocked until the vendor's servers restart overnight. Nothing
answers 429 first.

The queue is per process and the limit is per account, so the ceiling is kept by
a budget across processes (`call-budget.ts`): a sweep gets
`BM_MAX_SWEEP_CONCURRENCY` = 20 - 4 live lanes on the server - 4 single-lane
callers (the server's and the sweeping process's shared lanes, the reconcile and
expiry crons) = 12. That holds only because Booking Manager is in
`EXCLUSIVE_PROVIDER_CODES` (`sync/run.ts`), so the catalogue walk, the half-hourly
availability run and the price-weeks pass never overlap; the catalogue job waits up
to 20 minutes for an availability run that holds the lock at 01:00. It also assumes
one server replica and one deployment per key: a second replica, or staging on the
production key, needs the sweep lowered to match.

That is what lets the two sweeps that are one-read-per-item widen themselves. The
catalogue's `/yachts` walk (one read per charter company, ~1300 on a production
key) and the price loader's `/prices` walk (one read per charter week, ~104 for a
two-year window) each run `BOOKING_MANAGER_SWEEP_CONCURRENCY` reads at a time (12 by
default, which is also the budget's ceiling), spread over that many queue lanes so every lane keeps the same spacing.
Results are still delivered in list order, because the catalogue resume cursor is a
position in the company list. Setting the variable to 1 restores the
strictly-sequential walk.

Two full-scale runs against a production credential on 2026-08-20, all 1307 companies
with only the vendor's test company excluded, fixed the default:

| Width | Ingest   | Price sweep | Total   | `sync_error` |
| ----- | -------- | ----------- | ------- | ------------ |
| 6     | 15.2 min | 4.0 min     | ~25 min | 0            |
| 12    | 7.3 min  | 3.6 min     | ~18 min | 0            |

Both wrote identical results (15,176 records, 10,980 listings, 656,254 price periods).
The ingest scaled 2.09x for 2x the width, which is what a latency-bound sweep does
when the far end is not throttling. The price sweep barely moved, and would not: ~104
reads at width 6 is already only ~18 rounds, so what is left is per-request latency on
fleet-wide payloads rather than queueing. Widening past 12 is therefore mostly buying
nothing, and the account budget above now forbids it anyway.

## 3. Endpoint inventory

Paths below are relative to the base URL and are the literal values in
`bookingManagerEndpoints`.

### 3.1 Catalogue

Full dumps, no cursor. Each projects into one canonical resource type.

| Endpoint                           | Provider data                                                                                                                                                                                                                                                                                                                                                                                                        | Resource type / marketplace mapping                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `countries`, `country/{id}`        | Country identity, short/long names, world region link                                                                                                                                                                                                                                                                                                                                                                | `country`                                                                                                                                                                       |
| `worldRegions`, `worldRegion/{id}` | Top-level geographic grouping                                                                                                                                                                                                                                                                                                                                                                                        | `region` (upper tier)                                                                                                                                                           |
| `sailingAreas`, `sailingArea/{id}` | Cruising areas used by extras validity and base grouping                                                                                                                                                                                                                                                                                                                                                             | `region` / destination facets                                                                                                                                                   |
| `bases`, `base/{id}`               | Base name, city, country, address, latitude/longitude, sailing areas                                                                                                                                                                                                                                                                                                                                                 | `base`; map coordinates to pins and handover details. **Latitude/longitude are declared as strings**, not numbers                                                               |
| `companies`, `company/{id}`        | Operator identity, address, contact, VAT, bank account, T&C, checkout note, max discount from commission                                                                                                                                                                                                                                                                                                             | `operator`; VAT and bank account are dropped before the raw payload is stored                                                                                                   |
| `shipyards`, `shipyard/{id}`       | Builder taxonomy                                                                                                                                                                                                                                                                                                                                                                                                     | lookup table; exposed as a spec/filter value                                                                                                                                    |
| `equipment`                        | Amenity taxonomy (id + name)                                                                                                                                                                                                                                                                                                                                                                                         | `amenity`, `listing_amenity`                                                                                                                                                    |
| `yachtTypes`                       | Yacht kind taxonomy (name only, no id)                                                                                                                                                                                                                                                                                                                                                                               | lookup values for filters                                                                                                                                                       |
| `yachts`, `yacht/{id}`             | Full yacht record: identity, home base, company, shipyard, year, dimensions, tanks, engine, deposit, commission, berths/cabins/WC (+ their notes), sail areas, licence requirement, default check-in day/time and check-out time, minimum charter duration, max people on board, images, equipment (three shapes: `equipmentIds`, `equipment`, `equipmentRaw`), products with extras, categorized descriptions, crew | `provider_listing` → canonical `listing`, `listing_specification`, `listing_media`, `listing_amenity`, `listing_checkin_rule`; `products[].extras` → `provider_extra_catalogue` |

`listing_media` needs source provider, external media URL, role, sort order,
import time and an optional Cloudinary asset ID. `restImageSchema` supplies `id`,
`name`, `description`, `url` and `sortOrder`. There is no role flag, but operators
label pictures in `description`: the first `Main image` is the cover, `Plan image`
is the layout, the rest is gallery (no `Main image`: the first picture that is not a
plan). `sortOrder` is 0 on every picture of company 225, so it orders only the
pictures that set it, after which array order stands. Media rights were answered
verbally (§9).

What else the projection reads off `/yachts` (all measured on 225 and the account):

- **Products.** Extras, crew and the weekly price come from the yacht's **default
  product** only (`isDefaultProduct`, else the first product), because `/offers` and
  `POST /reservation` sell only that one without `productName`. Its name is sent as
  `productName` on the quote and the reservation (`loadBookingManagerProductName`).
  `crewedByDefault` or a Crewed product makes the listing `full-crew`, Skippered
  `skipper`, Bareboat and Flotilla `bareboat`; an obligatory priced crew extra on a
  bareboat carries its `crewRole`. Cabin and berth products set no crew type.
- **Extras.** `validForBases` is a list of allowed `from`>`to` routes
  (`provider_extra_catalogue.valid_routes`), not a one-way flag; `availableInBase`
  and `validSailingAreas` narrow where an extra applies; `includesDepositWaiver`
  (the spec's `includedDepositWaiver` is a fallback) and `depositWithWaiver` give
  the reduced deposit; `includedExtras` lists what a pack already contains, and a
  requested pack is netted by the obligatory extras the quote already bills (pending
  vendor question 21, section 10); `description` becomes the line's fine print;
  `quantityLimit`/`quantityIsSelectable` are recorded, not yet used by checkout.
- **Limits and rig.** `maxPeopleOnBoard` is `spec.maxPersons`,
  `maximumCharterDuration` is `max_nights` on every check-in rule,
  `requiredSkipperLicense: 0` clears the licence requirement, `mainsailType` and
  `engine` fill `sailType`, `enginePower` and `engines` (`None`/`Keine` read as
  unset). `genoaType` has no column.
- **Equipment.** Categories come through `equipmentRaw.parentId` (`-1` is an item
  the operator added), and names are translated from `/equipment?language=` for
  de, es, fr, it, nl, no, pl and sv. `da` and `ua` answer in English, so they are
  never asked. `/yachts` stays without `language`: it translates `kind`, which is a
  join key.
- **Operator and base.** `Company.checkoutNote` becomes the operator's return
  note, `Base.address` the marina line, base coordinates are kept only as a whole
  point inside the globe, and each vendor base id is bound to its row in
  `base_source`, so a base that changes region moves in place instead of forking.
  A base whose only region is a coarse sailing area is filed under a curated name
  (`sailing-area-regions.json`). The company's `vatCode` and `bankAccountNumber` are
  dropped before the raw payload is stored.
- **Commercial caps.** `maxDiscountFromCommissionPercentage` (yacht, else company)
  caps our own discounts at that share of the offer's `commissionValue`
  (`discount-cap.ts`); the reading as a share of commission is the conservative one
  until questions-v2 Q2 is answered.

### 3.2 Availability

| Endpoint                   | Provider data                                                                                                           | Marketplace use                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `availability/{year}`      | Per-yacht occupied periods: `dateFrom`, `dateTo`, `yachtId`, `status`, `baseFromId`, `baseToId`, `optionExpirationDate` | `availability_slot` fill; detail-page calendar; background refresh                                                         |
| `shortAvailability/{year}` | Bulk compressed year view, one record per yacht: `y` (yacht id), `bs` (one character per day)                           | cheap whole-fleet refresh; `format` selects the encoding (`BM_SHORT_AVAILABILITY_FORMAT`: `1` binary, `2` hex, `3` status) |

The field names on `shortAvailability` are abbreviated by the vendor to keep the
bulk payload small; they are not a typo. `shortAvailability` is not called by the
sync; it was used once to measure that `dateTo` is exclusive.

How `/availability` is read (measured on 225, 2026-09-22):

- `dateTo` is the exclusive check-out day. A row that crosses New Year comes back
  whole in both years' dumps and is clipped per year; each year runs to the next
  one's 1 January, and clean neighbouring years join into one calendar, so a free
  stretch can span 31 December.
- A status `5` row is skipped: our `DELETE` sets it and `/offers` sells the week
  again at once. Every other status blocks, including an unknown or missing one,
  which is counted in one `booking_manager.availability.unknown_status` warning per
  dump.
- `baseFromId`/`baseToId` are carried on the occupied interval. After a one-way
  charter that ends away from the listing's home base, no free time is published
  until a charter ends at home again, since the boat is not where the card says. The
  confirming `/offers` sweep still sells the weeks the vendor itself offers.

### 3.3 Pricing and offers

| Endpoint                                     | Provider data                                                                                                                                                                                                                                                                                                       | Marketplace use                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `offers`                                     | Date-specific bookable offers: yacht, start/end base, period, product, `price`, `currency`, `startPrice`, `obligatoryExtrasPrice`, `obligatoryExtras`, `paymentPlan`, `securityDeposit`, `commissionPercentage`, `commissionValue`, `discountPercentage`, and `myReservationId` when called with `showOptions=true` | primary live search and quote candidate source (`AvailableOffer`, `ProviderQuote`) |
| `specialOffers`, `specialOffers/{offerType}` | Promotional offer subsets                                                                                                                                                                                                                                                                                           | later merchandising; not a quote source                                            |
| `prices`                                     | Indicative period prices per yacht: `yachtId`, `dateFrom`, `dateTo`, `product`, `price`, `currency`, `startPrice`, `discountPercentage`                                                                                                                                                                             | card/"from" prices and audit; never the transacted amount                          |

Never cache an `offers` result as a booking guarantee. Every checkout quote
re-runs the provider query.

`/offers` as the quote uses it: `productName` is the listing's default product,
`startBaseId` and `endBaseId` are the route the customer chose (a pinned pair the
vendor does not sell that week refuses with `ROUTE_NOT_OFFERED`, and a stored product
it no longer sells with `PRODUCT_NOT_OFFERED`; neither takes the week off the card),
`currency` is the quote's, and offers at price 0 or below are dropped before ranking.
The confirming sweep sends `passengersOnBoard=1`, because without it the vendor
counts per-person extras for two people (not the berths the spec says), and the card
counts them once; the quote sends the real party. `discounts[]` become one line per
step under the operator's own name when they add up to `startPrice - price`. A
payment plan of three or more instalments is collapsed on purpose into a deposit and
one balance (`booking_manager.quote.payment_plan_collapsed`). In a converted offer
`price` and the extras use two different rates, so totals are built only from the
vendor's own lines, never converted by us (vendor question 20, section 10).

`/prices` is a price list, not a promise to sell: it prices one-way pairs, lengths
under the yacht's minimum, and weeks `/offers` never sells (Alien on 225). So
`selectBookingManagerWeeklyPrices` keeps one row per yacht-week (§8b), a complete sweep
deletes the weekly rates it no longer states (`prices.periods_pruned`), and a week
that is priced but absent from a whole-scope `/offers` answer is refused for the card
by the confirming sweep.

### 3.4 Booking

| Endpoint              | Method       | Canonical action                                                                 |
| --------------------- | ------------ | -------------------------------------------------------------------------------- |
| `reservation`         | write        | create a reservation or option                                                   |
| `reservation/{id}`    | read / write | read, amend or cancel a specific reservation                                     |
| `reservations/{year}` | read         | our agency's reservations for a year: finding our own expired option on recovery |

Reservation records carry `id`, `charterReservationId` (agency reservations
only), `reservationCode`, the period, `creationDate` / `confirmationDate` /
`expirationDate`, `yachtId`, `status`, `productName`, base from/to, currency,
client identity, the price block (§6), invoice `items`, `paymentPlan`,
`bankDetails`, `termsOfPayment` and `remarks`.

`expirationDate` is what drives the hold. `holdExpiresAt` is computed as
`expirationDate − BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES` (default 15) so
our sweeper releases before the vendor does.

Every reservation exists twice. POST answers with the charter-side record (id ending in the
operator's company id), which is the handle we key on; `showOptions`' `myReservationId`,
`reservations/{year}` and the answers to PUT and DELETE carry the agency-side twin (id ending in
ours) with `charterReservationId` pointing back. `booking.provider_agency_reservation_id` keeps
the twin's id once we learn it (the confirming PUT, or recovering an option), and anything that
matches a vendor list back to a booking goes through `charterReservationId`.

A create is sent once (there is no idempotency key, Q10) with the long sync ceiling, since the
vendor's cold start sits near the quote's 30 s. When it does not answer, or answers `400 Yacht is
not available, own Option exists.`, the adapter looks for our option on the slot instead of
sending it again: `offers?showOptions=true` for an open one (`myReservationId`, agency side),
then `reservations/{year}?month=` for an expired one, which `showOptions` omits although it
still blocks the week, then the charter-side record. An option a live booking of ours holds
refuses the slot (`OWN_OPTION_HELD`, never learned as the week sold). An orphan is taken over
when it is open, for this customer and on exactly our terms (the create that timed out), and
otherwise deleted and the create sent once more.

The confirm is `PUT reservation/{id}?sendNotification=` with no body (the spec declares none,
and Q8 measured every field of one ignored). It is not repeated blind: the record is read
first (already `1` is taken as confirmed, `3` or `5` refuses with `OPTION_LAPSED`), the PUT is
sent once with the long ceiling, and after one that did not answer the record is read again:
`1` means it landed, a still open option earns one more PUT, and an unreadable record leaves
the booking indeterminate in CONFIRMING. Only an answer at `1` is reported as confirmed; one
still at `2` returns as a hold, which the booking chain leaves in CONFIRMING rather than
marking CONFIRMED or refunding. Not exercised live, since it would fix a charter on 225.

The create's answer is checked before it is trusted: it must be an open option
(status `2`; a `9` is released and refused as `NOT_AN_OPTION`), and its yacht, dates,
bases, product, currency and `clientPrice` must be what we sent, since the vendor
silently rewrites a base pair it does not sell or a currency it will not book. Any
difference deletes the option and refuses the hold (`RESERVATION_SUBSTITUTED`).
`clientPrice` is compared with every line paid online: the charter net of vendor
discounts plus the obligatory extras not `payableInBase`.

Releasing a hold deletes the option by id, an expired one (status `3`) too, since it
keeps blocking the week until deleted; a record already at `5` counts as released. A
refused confirm releases our option the same way.

**Reconciliation.** `listChangedReservations` reads `GET reservation/{id}` once per
held id, sequentially on the shared lane: `1` confirmed, `2` open, `5` cancelled (by
the operator when we did not ask), `3` or a `2` past its `expirationDate` lapsed, and
any other status, or none, comes back as unrecognised and fails the run as status
drift. A 404 is logged and skipped until the vendor says what it means. It
deliberately does not use `reservations/{year}` (no status `5` without a filter, and
agency-wide, so it cannot tell our options from ones the agency makes by hand) or
`/objects/Reservation/search/` (non-monotonic sync point, misses cancellations).
Bookings whose check-out is more than two days past are no longer read.

What the hold keeps off the option (measured on company 225, 2026-09-22):

- `crewListLink`: the operator's hosted crew-list page, already present on the option, on both
  twins, and identical in substance to `GET /crewListLink/{id}`. Carried to
  `booking.crew_list_link`, so the confirmation email and `booking.get` offer it the way they
  offer NauSYS's.
- `finalPrice`, `agencyPaymentPlan` and `termsOfPayment` off the charter-side record, as
  `booking.operator_settlement`: what we owe the operator and when. Staff-only, since it gives
  away our margin. The agency twin has no plan and a `finalPrice` equal to the client's, so it is
  never read from there. `bankDetails` is not kept, as no operator bank data is.

## 4. Reservation status enum

`status` on both reservation and availability records:

| Value | Name             | Meaning                                                                  |
| ----- | ---------------- | ------------------------------------------------------------------------ |
| 1     | `RESERVATION`    | confirmed booking                                                        |
| 2     | `OPTION`         | soft hold                                                                |
| 3     | `OPTION_EXPIRED` | lapsed option, still blocks the week                                     |
| 4     | `SERVICE`        | vendor maintenance or delivery block                                     |
| 5     | `CANCELLED`      | cancelled; skipped by the availability read, a cancellation on reconcile |

Statuses past 5 appear on `/availability` (7, 8, 11 among them, questions-v2 Q5) and on
the create (`9`, OPTION_ON_WAITING). All of them block the week; on a held reservation
of ours any status but 1, 2, 3 and 5 is reported as drift.

**3 is not a live hold.** The spec calls it "option in expiration"; the vendor's own
status list names it "Option expired" (`BLOCKS_AVAILABILITY` true), and measured on
company 225 on 2026-09-22 a lapsed option stays at 3 indefinitely and keeps its week out of
`/offers`. The adapter reads it as closed and deletes an expired option of ours on release.

**4 is not a sale.** It is the vendor blocking its own boat for maintenance or a
delivery leg. It must project to **`blocked` inventory**, never to a booking, an
operator revenue figure, or anything the reconciliation job treats as ours. The
NauSYS import met the identical concept as an _undocumented_ `SERVICE`
reservation type and had to be taught the same thing after the fact (commit
`0d9a822`). Here it is documented, so there is no excuse for reading it as a
booking. The enum is named in code as `BM_RESERVATION_STATUS` rather than left as
bare numbers for the same reason.

## 5. Date and time semantics (vendor-confirmed)

Answered directly by **support@mmksystems.com, August 2026**. Recorded here as
vendor-confirmed rather than inferred, because the API sends no timezone
information at all and the behaviour is otherwise unguessable.

1. **Fixed CET clock that observes daylight saving.** All non-`/offers` calls are
   read and written against a fixed Central European clock, and that clock _does_
   shift for DST - so effectively CET/CEST. `BOOKING_MANAGER_TIMEZONE` must
   therefore be a real IANA zone in that family (default `Europe/Zagreb`). A
   fixed `+01:00` offset would be an hour wrong all summer.
2. **Requests use a literal `T`:** `yyyy-MM-ddTHH:mm:ss`. **Seconds are
   mandatory** - the call is rejected without them, even though charters never
   need second precision.
3. **Responses use a space:** `yyyy-MM-dd HH:mm:ss`.
4. **No timezone suffix ever appears in either direction.** No `Z`, no offset.
   Both directions are naked wall clocks.
5. **No per-base IANA zone or UTC offset is exposed.** If a base's own zone is
   ever needed, derive it from the base's `Country`.
6. **`/offers` is the exception.** Send times as `00:00:00`; the vendor
   substitutes the base's **real check-in and check-out time** into the response.
   Asking `/offers` for a specific time is wrong, not merely redundant. This is
   also why base check-in/check-out times are _not_ converted through
   `BOOKING_MANAGER_TIMEZONE` - they are the base's own local wall clock and stay
   plain strings.

**Ambiguous wall clocks resolve to the earlier instant.** During the autumn
fall-back hour a naked local time names two instants; `parseBookingManagerDateTime`
delegates to `wallClockToInstant` in `shared/dates.ts`, which picks the earlier
one. Same rule NauSYS settled on (commit `aadf8f2`) and for the same reason:
reading a deadline an hour late lets us sell a slot the provider has already
released.

Implementation: `packages/providers/src/booking-manager/dates.ts` -
`parseBookingManagerDateTime`, `parseBookingManagerDate`,
`formatBookingManagerDateTime`.

## 6. Pricing fields

Two different price vocabularies, depending on which side of the booking you are
on.

**Offers** (`restOfferSchema`):

| Field                                     | Meaning                          |
| ----------------------------------------- | -------------------------------- |
| `price`                                   | the offer price for the period   |
| `startPrice`                              | undiscounted starting/list price |
| `obligatoryExtrasPrice`                   | total of the unavoidable extras  |
| `securityDeposit`                         | refundable deposit               |
| `commissionPercentage`, `commissionValue` | agency commission, two forms     |
| `discountPercentage`                      | discount already applied         |

**Reservations** (`restReservationSchema`): `basePrice`, `discount`,
`commission`, `finalPrice`, `clientPrice`.

> **Open vendor question.** The exact relationship between `finalPrice` and
> `clientPrice`, and where our commission sits relative to them, is **not yet
> confirmed**. It is item **7 (Pricing semantics)** in
> [`open-questions-and-decisions.md`](./open-questions-and-decisions.md) §3 -
> asked of both providers, answered by neither. Until it is answered, do not
> hard-code which of the two the customer pays. Persist both, plus the commission
> pair, in the immutable quote snapshot, and treat the choice as one switch in
> the mapper rather than an assumption spread through the pricing pipeline.

Measured on 225 since (2026-09-22), not vendor-confirmed: on the charter-side record
`finalPrice` is the operator's net (1445 against a `clientPrice` of 1700), and
`clientPrice` equals the charter net of vendor discounts plus the obligatory extras
that are not `payableInBase`, on 112 of 116 saved reservations (the other four differ
only by an "Agency discount" line). The hold checks `clientPrice` that way, and keeps
`finalPrice` as `booking.operator_settlement`, never as what the customer pays.

Money is stored as integer minor units plus ISO currency (D-MONEY); percentages
stay exact decimals.

## 7. Cross-provider notes

Per [`backend-architecture.md`](./backend-architecture.md) §3:

1. **Media precedence goes to Booking Manager.** When a canonical `listing` links
   to both a Booking Manager and a NauSYS source, the Booking Manager gallery
   wins and NauSYS is the fallback. A per-field `selected_source` decision is
   retained so the preference can be revised.
2. **Specs follow `primary_source_id`**, amenities are a de-duped union, and live
   availability and price are **reconciled at quote time, never merged**.
3. **Default transacting source** when a yacht exists in both providers: the
   **lower client price at quote time, tie-broken to Booking Manager**. This is
   flagged `[ASSUMPTION]` there and is pending Q-DUP.
4. **Same yacht in both providers is never auto-merged.** The matcher scores
   operator, base, model, length, year and fuzzy name into `match_confidence` and
   writes the pair to `listing_duplicate_candidate` for human review.
   `listing_source.source_status` moves `unmatched` → `auto` → `confirmed`;
   nothing publishes on `auto` alone, and every merge or split writes
   `audit_log`.
5. A selected offer has exactly one provider source. Its quote, option and
   booking all stay with that source.

## 8. Deliberate MVP exclusions

`specialOffers` merchandising, crew profiles (`Yacht.crew[]`, `restCrewSchema`: named
operator staff with age, nationality and photo, which needs a table, a page section and
a product decision on showing them), linked documents (the live key is `documents`, the
spec says `document`), `Yacht.transitLog` (outside `obligatoryExtrasPrice`; whether the
base collects it is vendor question 18, and surfacing it would double count the 889
hulls that already carry an obligatory "Transit log" extra), `Company.rating`, and
cabin/berth-level charter products are parsed and retained but not projected into
public tables or oRPC procedures until the product scope includes them. Preserving the
raw records keeps every one of those a later addition rather than a re-sync.

## 8b. The vendor's own integration guide

The knowledge base at `support.booking-manager.com/hc/en-us/sections/360000531632-Rest-API`
carries four articles, all four read as of 2026-08-19. "Booking Manager API User
Manual-REST" is a stub that only links to the Swagger, and "Introduction to REST
API" is onboarding: neither adds a requirement. The load-bearing two are quoted
below. It is worth reading before changing the sync: two of its
statements are load-bearing and are not in the Swagger. Note the site 403s
automated fetches and needs a real browser.

**API keys** are generated on the portal at **My Account > API Integration** (on a
local Booking Manager install, **Preferences > Company > API Integration**). The
UI calls it an API key; the API consumes it as a Bearer token.

**Prescribed sync shape**, from "How to start the RESTful web service integration":

1. `GET /companies` first, then parse boats company by company with
   `GET /yachts`, storing everything locally. This is what `catalogue.ts` does.
2. Store locally everything not related to real-time availability: shipyards,
   bases, sailing areas, equipment (`equipmentIds`), pictures (`images`), extras.
3. **`GET /prices` is called once per Saturday-to-Saturday pair** to build a
   year's price list, and **sending only `dateFrom`/`dateTo`, with no `yachtId`,
   returns every boat in the system for that period.** `prices.ts` implements
   exactly this. It also settles Q-BM-PRICE-DURATION: a row prices the period you
   asked for, so a Saturday-to-Saturday request is a weekly figure by
   construction and nothing is inferred from the span.
   A week comes back once per product and once per base pair (2.2.2 adds
   `startBaseId`/`endBaseId`), and `/offers` sells only the default product and,
   on company 225, only the round trip. So `selectBookingManagerWeeklyPrices`
   keeps one row per yacht-week: the default product (`price-terms.ts`, off the
   stored yacht), a round trip at the home base else at any base, never a one-way
   pair, and no week at all for a yacht whose `maximumCharterDuration` is below
   the four nights the weekly list estimates from. A yacht with a longer minimum
   or a shorter maximum than a week keeps its bands: they price its other
   lengths per night, and its check-in rules keep the week itself unsold.
4. `GET /offers` per Saturday-to-Saturday pair gives real-time availability;
   `/availability` and `/shortAvailability` give booked/free status across a year.
5. The base to country and sailing-area chain is reconstructed exactly as §3
   describes, and the guide's worked example (base "Cala Bitta", `countryId` 380,
   `sailingAreas` `[19]`) is the shape `projection.ts` rebuilds.

**Field-name discrepancy.** That worked example returns `/countries` rows as
`{id, worldRegion, name, shortName, longName}`, while the Swagger declares
`short`/`long`. One of the two is stale. `restCountrySchema` accepts both, because
the loose schemas mean a mismatch would not throw: it would silently drop every
ISO country code, which is the field that merges a country across providers.

**Whose payment plan `/offers` returns**, from "How to view the Payment Plan via
Rest API" (added to the KB in 2026, and the reason this section was revisited):

> the Payment Plan data in `getOffers` and in `createReservation` is "the Payment
> Plan that the Agent must respect towards the Charter operator". Only after
> `confirmReservation` does the system show "the Payment Plan of the Agent and no
> longer of the charter" - what the guest owes the agency.

We are the agency, and `toPaymentPolicy` in `quote.ts` derives the customer's
deposit from the `/offers` plan. So the split we present at checkout is currently
our own obligation to the operator, not a schedule we chose. That is conservative
on cash flow - we never collect less than we owe - but it lets each operator's
terms set our customer-facing deposit, and MMK supports entering an agency plan of
our own in the portal. **Q-BM-PAYPLAN**: decide whether to keep mirroring the
charter's plan, or publish our own and read the agency plan back after confirm.

What is done meanwhile: the customer's balance falls due `BOOKING_MANAGER_BALANCE_LEAD_DAYS`
(default 7) before the plan's second date rather than on it, since that is also the day we
owe the operator (on 225 `paymentPlan` and `agencyPaymentPlan` both fell due 2026-09-29), and
a balance the lead would put on or before today is taken in full. The option's
`agencyPaymentPlan` is stored as `booking.operator_settlement`, re-read after confirm, and a
customer schedule that would leave us paying the operator first is logged as
`booking.operator_due_before_customer`.

**`showOptions` does not gate the payment plan.** The article's worked example
passes `showOptions=True`, which reads as though the plan depends on it. Measured
against the live endpoint on 2026-08-19, company 225, 2026-08-22 to 2026-08-29:
five offers, all five carrying a `paymentPlan`, with and without the flag, and
identical either way. The flag adds `myReservationId` and nothing else, which is
what `restOfferSchema` already says.

**No pagination on the endpoints we use.** The only volume guidance ("How to
manipulate large set of data thru API") is SOAP-era and tells the caller to raise
its own parser limits, which implies large single responses rather than paged
ones. `/yachts` with no `companyId` bears this out: it did not answer inside 120
seconds when tried on 2026-08-19.

**But `/objects/{entity}/search/` pages, and carries a sync point.** Added in spec
2.2.0, so it does not exist in the 2.1.4 this connector was written against, and we
use none of it. It is live on the production host. Two things it offers are things
we recorded as open vendor questions:

- **`lastSyncPoint` in, `syncpoint` out.** A "changed since" cursor, which is
  exactly Q-BM-DELTA. If it works for `Resource`, the catalogue need not walk 1308
  companies to learn that nothing moved.
- **`page` / `per_page` / `page_count` / `total_count`**, plus `fields.include` to
  select columns and `filterRules` for predicates.

`Entity` is `User | Reservation | Resource | Payment | PaymentMethod | Service`.
`Resource` is the boat - the SOAP call for the fleet was `getResources`, and
`/objects/Resource/properties` returns `MODEL_AND_NAME`, `BERTHS`, `BOAT_CLASS`.
`Reservation` is worth as much: nothing today tells us a Booking Manager
reservation changed operator-side, because the BM availability source deliberately
defines no `searchConfirmed` where the NauSYS one does.

**Measured on 2026-08-19.** The endpoint works on our key, and the shape of a
working call is not obvious from the spec:

- **`filterRules` is effectively mandatory.** A body with none returns zero
  objects rather than everything. `{"field":"ID","value":"","matchRule":10}` -
  `matchRule` 10 is `EXISTS` - is the match-all idiom.
- `matchRule` is `0 STARTS_WITH_IGNORE_CASE, 1 EQUALS_IGNORE_CASE, 2
CONTAINS_IGNORE_CASE, 3 STARTS_WITH, 4 EQUALS, 5 CONTAINS, 6 LARGER, 7
LARGER_OR_EQUAL, 8 SMALLER, 9 SMALLER_OR_EQUAL, 10 EXISTS`.
- `total_count` does **not** track the filter. It stayed at 24816 for `Resource`
  across every rule tried, including an `EQUALS` on a yacht id we hold. Read it as
  the entity's population, not the match count.
- `page_count` came back equal to the number of objects returned, not the number
  of pages. Unconfirmed, and worth pinning down before paging anything.

**Where it works, and where it does not.** With the EXISTS idiom:

| entity        | objects  | total_count |
| ------------- | -------- | ----------- |
| `User`        | returned | 19          |
| `Reservation` | returned | 526127      |
| `Service`     | returned | 8541        |
| `Resource`    | **none** | 24816       |
| `Payment`     | **none** | 2           |

So this is not a malformed request: three entities answer with rows on the same
credential and the same body. `Resource` returns nothing whatever the field or
rule - `ID`, `MODEL_AND_NAME`, `RESOURCE_TYPE`, `BERTHS`, `DISABLED` all give zero,
and `RESOURCE_ID`, the field the spec's own `FilterRule` example names, is not a
valid field and errors. The likeliest reading is that object-level read on
`Resource` is not granted to an agency key, but that is a guess and **Q-BM-OBJECTS**
asks it directly.

**`Reservation` is the one to want first.** It answers today, it has a sync point,
and it covers a real blind spot: nothing tells us a Booking Manager reservation
changed operator-side, because the BM availability source defines no
`searchConfirmed` where the NauSYS one does. A catalogue delta needs `Resource` and
therefore needs the vendor; reservation reconciliation appears to need neither.

**24816 is also the fleet size** the sync-duration arithmetic wants, and it is far
above the 13-15k that was being assumed from fleet-size guesses.

## 9. Open vendor questions

**What is still open after the 2026-09-22 audit is listed in §10.3**, and in section H of
the sendable list. **The sendable list lives in [`booking-manager-vendor-questions.md`](./booking-manager-vendor-questions.md)**,
which consolidates these, the Booking Manager items from
`open-questions-and-decisions.md` §3, and every `Q-BM-*` marker in the connector,
each stated with the assumption we ship so a short answer resolves it. The
summary below is kept for readers of this document.

Outstanding with MMK. Everything in §5 and the price-duration question in §8b are
now answered; these are not.

- **Rate limits.** No documented limit or retry guidance. We self-throttle at
  250 ms between calls, which is a guess. The Saturday sweep is 52 calls per year
  per sync, so this matters.
- **Delta sync.** `/yachts` has no "changed since" parameter, but
  `/objects/{entity}/search/` has `lastSyncPoint` (see §8b) and we have not made it
  return objects. The question to MMK is now narrower: what does a `Resource`
  search need in order to return rows, and is its sync point a supported way to
  keep a fleet current?
- **Which `/countries` spelling is current**, `short`/`long` or
  `shortName`/`longName`. We accept both; confirming lets one be dropped.
- **Array query-parameter encoding.** Repeat-key (`?id=1&id=2`) or comma-joined
  (`?id=1,2`)? The spec does not say. **We default to repeat-key** and this needs
  confirming before the first live filtered call.
- **Stable cross-provider identifiers.** Is a hull number, MMSI or IMO exposed
  per yacht? Without one, duplicate matching stays fuzzy and human-reviewed (§7).
- **Webhooks versus polling.** Any push mechanism for price, availability, option
  or cancellation changes, or must we poll?
- **Option expiry and cancellation windows.** Exact hold duration, cancellation
  deadlines, penalties, and who may cancel. Drives whether
  `optionExpiryOwnedByProvider` can be `true`.
- ~~**Media and image rights.**~~ **Answered (Sep 2026, verbally):** we may cache,
  copy and transform their photos and serve them from our own storage. Still to be
  confirmed by email, with the governing T&C clause, before the contract is signed.
- **Pricing semantics** - see the callout in §6.

## 10. Coverage against 2.2.2 (audit of 2026-09-22)

Every endpoint of spec 2.2.2, what the connector does with it, and why the rest is not
called. Checked against the code on `feat/bm-api-coverage` and, where the rules allow,
live on test company 225 (the end-to-end run: catalogue, availability, price weeks,
quote, hold, reconcile, cancel and an operator-side cancel, all on 225, both options
deleted afterwards).

### 10.1 Covered

| Endpoint                                                                                                      | Use                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET countries`, `worldRegions`, `sailingAreas`, `bases`, `equipment`, `companies`, `shipyards`, `yachtTypes` | nightly full dumps (§3.1, §8b); `equipment` also once per translated language |
| `GET yachts?companyId=`                                                                                       | nightly catalogue walk, one call per company (§3.1)                           |
| `GET availability/{year}`                                                                                     | half-hourly availability run (§3.2)                                           |
| `GET prices`                                                                                                  | weekly price list, one call per Saturday pair (§3.3, §8b)                     |
| `GET offers`                                                                                                  | quote, the confirming sweep, `showOptions=true` to find our own option        |
| `POST reservation`                                                                                            | create the option, sent once (§3.4)                                           |
| `GET reservation/{id}`                                                                                        | read around the confirm, release, recovery, reconcile                         |
| `PUT reservation/{id}`                                                                                        | confirm, no body, `sendNotification` only; not exercised live                 |
| `DELETE reservation/{id}`                                                                                     | release an open or expired option                                             |
| `GET reservations/{year}?month=`                                                                              | find our own expired option after a failed create                             |

### 10.2 Deliberately not used

| Endpoint                                                                                             | Why                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `country/{id}`, `worldRegion/{id}`, `sailingArea/{id}`, `base/{id}`, `company/{id}`, `shipyard/{id}` | the vendor prescribes full dumps; no dangling reference found                                                                                                    |
| `yacht/{id}`                                                                                         | identical to the list record; used only by `scripts/import-booking-manager-yacht.ts`                                                                             |
| `yachtsOnSale`                                                                                       | yacht sales, not charter                                                                                                                                         |
| `specialOffers`, `specialOffers/{offerType}`                                                         | merchandising, not a quote source (§8)                                                                                                                           |
| `shortAvailability/{year}`                                                                           | `/availability` carries the statuses and bases we need                                                                                                           |
| `prices?tripDuration=`                                                                               | the guide prescribes Saturday pairs; short charters are priced by `/offers` (remaining-work §2.4 item 14)                                                        |
| `PUT setWeeklyPrice/{id}`                                                                            | an operator's write, not an agency's                                                                                                                             |
| `GET crewListLink/{id}`                                                                              | the create's answer already carries `crewListLink`, stored as `booking.crew_list_link`                                                                           |
| `POST addDocument/{itemType}`                                                                        | nothing of ours to attach; crew data goes through the operator's crew-list page                                                                                  |
| `GET skippers`                                                                                       | crew profiles are an MVP exclusion (§8)                                                                                                                          |
| `GET users`, `users/search`, `GET`/`PUT users/{id}`                                                  | no address-book sync is needed                                                                                                                                   |
| `POST requests` type 1, and deleting a confirmed reservation                                         | the vendor answered that a confirmed booking is cancelled by the operator, not by the API                                                                        |
| `GET objects/{entity}/properties`, `POST objects/{entity}/search/`                                   | `Resource` returns nothing to an agency key; `Reservation` as a delta is unreliable (non-monotonic sync point, misses cancellations), so reconcile reads each id |
| search filters on `/offers` (country, sailing area, min/max, kind, flexibility)                      | search runs on the local read model                                                                                                                              |
| `promoCode` on `/offers`                                                                             | marketplace promos are ours                                                                                                                                      |
| `GET payments`, `GET payments/{id}`                                                                  | nothing of ours to reconcile until payments are written (10.3)                                                                                                   |

### 10.3 Blocked on the vendor

Numbered as in the audit's question list; each is also in section H of
[`booking-manager-vendor-questions.md`](./booking-manager-vendor-questions.md).

| Endpoint or behaviour                                          | What waits                                                                                                                                                                                                     | Question |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `PUT reservation/{id}` on a repeat                             | whether a second PUT on a confirmed record answers 200 at `1` or a 4xx, and whether `sendNotification` affects an agency key. Today a `1` read before the PUT counts as confirmed and no second PUT is sent    | 1        |
| `PUT reservation/{id}` answer                                  | whether it can answer `2`, `3` or `5`, and what each means. Today anything but `1` leaves the booking in CONFIRMING for a person                                                                               | 2        |
| `Extras.validForBases`, `availableInBase`, `validSailingAreas` | whether our reading as allowed routes and areas matches how `obligatoryExtrasPrice` is computed. Absent on 225, so unmeasured                                                                                  | 4        |
| `POST reservation` status `9` (OPTION_ON_WAITING)              | whether it is visible on `showOptions` or `reservations/{year}` and deletable. Today a `9` is deleted and the hold refused                                                                                     | 7        |
| the 20-call account limit                                      | whether it counts per account, key or IP, and what signal precedes the block. Today the budget in §2 assumes one server replica per key                                                                        | 12       |
| `POST users` + `Reservation.clientId`                          | whether an agency key may create clients. Without it every option lands on one shared charter-side client and the operator sees only `clientName`                                                              | 14       |
| `POST reservation/{id}/payments`, `PUT`/`DELETE payments/{id}` | whether we may record a payment, on which twin, and how to get a `paymentMethodId` without `objects/PaymentMethod/search/`. Customer money goes through Stripe only; the operator payout is not recorded in BM | 15       |
| `GET invoices/{invoiceType}`                                   | whether an agency export locks the operator's invoices ("locked and unchangeable"). **Never call it, not even as a probe**, until answered                                                                     | 16       |
| `POST requests` type 0 (extend an option)                      | how the result becomes visible: on 225 a 200 changed no `expirationDate`                                                                                                                                       | 17       |
| `Yacht.transitLog`                                             | whether the base collects it (§8)                                                                                                                                                                              | 18       |
| status `3` "Option expired"                                    | why it keeps blocking the week, and whether our `DELETE` of a `3` frees it. Today ours are deleted on release and a refused delete is listed for a person                                                      | 19       |
| currency conversion in `/offers`                               | which of the two rates in one converted offer is authoritative for the reservation and the invoice. Every quote is asked in EUR today                                                                          | 20       |
| `Extras.includedExtras`                                        | what it means and whether a chosen pack's contents leave `obligatoryExtrasPrice`. Today a requested pack is netted by the obligatory extras it contains                                                        | 21       |
| `/prices` versus `/offers`                                     | whether `/prices` is a list with no promise to sell (one-way pairs, lengths under the minimum, weeks `/offers` never sells). Today it is read that way (§3.3)                                                  | 22       |

Two more wait on a business decision rather than the vendor: whether to publish our own
agency payment plan in the portal (Q-BM-PAYPLAN, §8b), and what to do with options on
the agency's list that no booking of ours matches (they cannot be told from ones staff
make by hand in Booking Manager).
