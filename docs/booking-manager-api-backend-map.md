# Booking Manager API v2.1.4 - backend integration map

Source: SwaggerHub `mmksystems/bm-api`, version **2.1.4**.

> **Read this before hunting for the spec.** The SwaggerHub _UI_ page for this API is
> login-walled, which reads like "no access" and has already cost one person an
> afternoon. The definition itself is publicly readable without an account at
> `https://api.swaggerhub.com/apis/mmksystems/bm-api/2.1.4`. Fetch that URL, not
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
| Env var             | `BOOKING_MANAGER_API_TOKEN`                                         |

The token is **not** an API-key header - not `X-API-Key`, not a query parameter.
`packages/providers/src/booking-manager/client.ts` sets a single
`authorization: Bearer …` header on the shared HTTP client and nothing else.

`BOOKING_MANAGER_API_TOKEN` is optional in the env schema so a missing secret
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
- **Booking Manager uses the default `httpStatusClassifier`.** NauSYS needs a
  custom classifier that opens the 200-OK envelope and reads `status` /
  `errorCode` out of the body. Booking Manager's real status codes map straight
  onto the shared taxonomy: 401 → `AuthError`, 404 → `NotFound`, 429/5xx →
  `RateLimited`/`Transient` (retried with backoff), and **422 falls through to
  `ContractError`**, which is correct - an unprocessable obligatory field is a
  payload we got wrong, not something a retry fixes.
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
Unlike NauSYS this is a precaution rather than a contractual requirement -
Booking Manager has published no concurrency rule, and no rate limit either
(§9).

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
| `companies`, `company/{id}`        | Operator identity, address, contact, VAT, bank account, T&C, checkout note, max discount from commission                                                                                                                                                                                                                                                                                                             | `operator`; keep bank/VAT only inside the encrypted raw payload                                                                                                                 |
| `shipyards`, `shipyard/{id}`       | Builder taxonomy                                                                                                                                                                                                                                                                                                                                                                                                     | lookup table; exposed as a spec/filter value                                                                                                                                    |
| `equipment`                        | Amenity taxonomy (id + name)                                                                                                                                                                                                                                                                                                                                                                                         | `amenity`, `listing_amenity`                                                                                                                                                    |
| `yachtTypes`                       | Yacht kind taxonomy (name only, no id)                                                                                                                                                                                                                                                                                                                                                                               | lookup values for filters                                                                                                                                                       |
| `yachts`, `yacht/{id}`             | Full yacht record: identity, home base, company, shipyard, year, dimensions, tanks, engine, deposit, commission, berths/cabins/WC (+ their notes), sail areas, licence requirement, default check-in day/time and check-out time, minimum charter duration, max people on board, images, equipment (three shapes: `equipmentIds`, `equipment`, `equipmentRaw`), products with extras, categorized descriptions, crew | `provider_listing` → canonical `listing`, `listing_specification`, `listing_media`, `listing_amenity`, `listing_checkin_rule`; `products[].extras` → `provider_extra_catalogue` |

`listing_media` needs source provider, external media URL, role, sort order,
import time and an optional Cloudinary asset ID. `restImageSchema` supplies
`name`, `description`, `url` and `sortOrder`; there is no explicit role flag, so
role is derived from sort order until the vendor says otherwise. Do not assume
rights to copy or transform media until the terms confirm it (§9).

### 3.2 Availability

| Endpoint                   | Provider data                                                                                                           | Marketplace use                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `availability/{year}`      | Per-yacht occupied periods: `dateFrom`, `dateTo`, `yachtId`, `status`, `baseFromId`, `baseToId`, `optionExpirationDate` | `availability_slot` fill; detail-page calendar; background refresh                                                         |
| `shortAvailability/{year}` | Bulk compressed year view, one record per yacht: `y` (yacht id), `bs` (one character per day)                           | cheap whole-fleet refresh; `format` selects the encoding (`BM_SHORT_AVAILABILITY_FORMAT`: `1` binary, `2` hex, `3` status) |

The field names on `shortAvailability` are abbreviated by the vendor to keep the
bulk payload small; they are not a typo.

### 3.3 Pricing and offers

| Endpoint                                     | Provider data                                                                                                                                                                                                                                                                                                       | Marketplace use                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `offers`                                     | Date-specific bookable offers: yacht, start/end base, period, product, `price`, `currency`, `startPrice`, `obligatoryExtrasPrice`, `obligatoryExtras`, `paymentPlan`, `securityDeposit`, `commissionPercentage`, `commissionValue`, `discountPercentage`, and `myReservationId` when called with `showOptions=true` | primary live search and quote candidate source (`AvailableOffer`, `ProviderQuote`) |
| `specialOffers`, `specialOffers/{offerType}` | Promotional offer subsets                                                                                                                                                                                                                                                                                           | later merchandising; not a quote source                                            |
| `prices`                                     | Indicative period prices per yacht: `yachtId`, `dateFrom`, `dateTo`, `product`, `price`, `currency`, `startPrice`, `discountPercentage`                                                                                                                                                                             | card/"from" prices and audit; never the transacted amount                          |

Never cache an `offers` result as a booking guarantee. Every checkout quote
re-runs the provider query.

### 3.4 Booking

| Endpoint              | Method       | Canonical action                                                                |
| --------------------- | ------------ | ------------------------------------------------------------------------------- |
| `reservation`         | write        | create a reservation or option                                                  |
| `reservation/{id}`    | read / write | read, amend or cancel a specific reservation                                    |
| `reservations/{year}` | read         | our agency's reservations for a year: reconciliation job, status refresh, audit |

Reservation records carry `id`, `charterReservationId` (agency reservations
only), `reservationCode`, the period, `creationDate` / `confirmationDate` /
`expirationDate`, `yachtId`, `status`, `productName`, base from/to, currency,
client identity, the price block (§6), invoice `items`, `paymentPlan`,
`bankDetails`, `termsOfPayment` and `remarks`.

`expirationDate` is what drives the hold. `holdExpiresAt` is computed as
`expirationDate − BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES` (default 15) so
our sweeper releases before the vendor does.

## 4. Reservation status enum

`status` on both reservation and availability records:

| Value | Name                   | Meaning                              |
| ----- | ---------------------- | ------------------------------------ |
| 1     | `RESERVATION`          | confirmed booking                    |
| 2     | `OPTION`               | soft hold                            |
| 3     | `OPTION_IN_EXPIRATION` | hold in its expiry window            |
| 4     | `SERVICE`              | vendor maintenance or delivery block |

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

`specialOffers` merchandising, crew profiles (`restCrewSchema`), linked
documents, and cabin/berth-level charter products are parsed and retained but not
projected into public tables or oRPC procedures until the product scope includes
them. Preserving the raw records keeps every one of those a later addition rather
than a re-sync.

## 8b. The vendor's own integration guide

The knowledge base at `support.booking-manager.com/hc/en-us/sections/360000531632-Rest-API`
carries four articles. It is worth reading before changing the sync: two of its
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

**No pagination anywhere.** The only volume guidance ("How to manipulate large set
of data thru API") is SOAP-era and tells the caller to raise its own parser
limits, which implies large single responses rather than paged ones.

## 9. Open vendor questions

Outstanding with MMK. Everything in §5 and the price-duration question in §8b are
now answered; these are not.

- **Rate limits.** No documented limit or retry guidance. We self-throttle at
  250 ms between calls, which is a guess. The Saturday sweep is 52 calls per year
  per sync, so this matters.
- **Delta sync.** Does `/yachts` support a "changed since" parameter, or is a
  full dump the only option? Determines whether the catalogue sync can ever be
  incremental.
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
- **Media and image rights.** May we cache and transform photos through our own
  image pipeline, or must we hotlink? Which terms document governs it?
- **Pricing semantics** - see the callout in §6.
