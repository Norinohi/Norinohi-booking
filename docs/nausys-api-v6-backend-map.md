# NauSYS API v6 - backend integration map

Source: `NAUSYSAPIV6-200726-1620-102_Agency.pdf` (358 pages, Agency API edition).

> **Canonical model:** [`backend-architecture.md`](./backend-architecture.md) is the authoritative shared vocabulary and data model for both providers. This document is the **NauSYS connector-specific reference** — it maps NauSYS endpoints/`Rest*` types onto the canonical names defined there (`listing`, `provider_record`+`listing_source`, `operator`, `amenity`, `booking`, `price_adjustment_rule`, …). Where naming here predates the reconciliation (e.g. `operator`/`provider_record`/`booking`), the canonical doc wins.

This is an implementation map, not a copy of the vendor PDF. It identifies every
documented API area and data-structure family, its purpose, and how it maps into
the Yacht Charter marketplace. The connector must keep all provider payloads and
IDs at its boundary; browser-facing oRPC procedures use the canonical contracts
defined here.

## 1. Integration model

NauSYS is a provider-specific system for many charter companies. Our application
is an agency/marketplace that will also integrate Booking Manager. Treat NauSYS
as an external source of truth for provider inventory, live availability and the
provider reservation lifecycle.

### Rules

1. Never use a NauSYS numeric ID as a public marketplace identifier. Store it in
   `provider_record.external_id`, unique on `(provider, resource_type, external_id)`.
2. Preserve raw request/response payloads for all syncs and booking mutations.
3. Catalogue data is imported to a local read model. Search cards and yacht pages
   must not call NauSYS directly.
4. Date-specific availability, final price, extras, deposit and payment schedule
   are volatile. Revalidate them during quote/option/booking.
5. A provider listing is not automatically the same yacht as a Booking Manager
   listing. Link sources to a canonical listing only after a reviewed match.
6. Provider credentials are server-only secrets. The web client never receives
   provider endpoint URLs, usernames, passwords, commission, agency cost, or raw
   provider errors.

### Recommended connector interface

```ts
interface InventoryProvider {
  syncCatalogue(cursor?: string): Promise<SyncPage>;
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>;
  getQuote(input: QuoteRequest): Promise<ProviderQuote>;
  createOption(input: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(input: ConfirmBooking): Promise<ProviderReservation>;
  cancelOption(input: ProviderReservationRef): Promise<void>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
}
```

Implement `MockInventoryProvider` first. `NausysProvider` adapts the endpoints
below to this interface. A later `BookingManagerProvider` implements the same
contract. The oRPC layer depends on the interface, never on NauSYS structures.

## 2. API surface map

### 2.1 Catalogue - PDF pages 16-71

All catalogue calls are POST endpoints under
`/CBMS-external/rest/catalogue/v6/` and use provider authentication. They feed
local import tables and canonical read models.

| Vendor endpoint / section | Provider data | Marketplace mapping |
| --- | --- | --- |
| `cabins/{charterCompanyId}` | Cabin IDs, position, type | `listing_cabin` only for cabin-charter support; not required for bareboat MVP |
| `charterBases` | Base, location/company IDs, check-in/out time, coordinates, disabled dates/notes | `base`; map coordinates to map pins and booking handover details |
| `charterCompanies` | Operator identity, address/contact, tax/bank details | `operator`; retain sensitive financial fields only in encrypted raw payload unless business needs them |
| `countries`, `countryStates`, `regions`, `locations` | Geographic hierarchy and localized labels | `country`, `region`, `location`; normalize for filters and destination pages |
| `discountItems` | Provider discount definitions | `provider_discount_definition`; snapshot applied discounts into quotes |
| `engineBuilders`, `yachtBuilders`, `yachtModels`, `yachtCategories` | Taxonomy/model metadata | normalized lookup tables or provider taxonomies; expose selected names to filters/details |
| `equipment`, `equipmentCategories` | Amenity taxonomy | `amenity`, `amenity_category`, `listing_amenity` |
| `leadSources`, `reservationTags`, `users`, `domains` | Provider CRM/operator administration | do not expose; retain only if required for agency reservation attribution or internal support |
| `packages` | Cabin-charter package metadata | later `charter_package`; out of bareboat MVP unless Figma includes it |
| `priceLists`, `priceMeasures`, `seasons` | Seasonal list-price configuration and units | `provider_price_list` for audit/import only; live quote is the sellable price source |
| `sailTypes`, `steeringTypes` | Yacht characteristics | lookup values used by yacht specifications and filters |
| `yachts/{companyId}` and `yacht/{yachtId}` | Full yacht catalogue record and images | `provider_listing` plus derived canonical `listing`, `listing_media`, specs and constraints |

#### Yacht data (`RestYacht`, PDF pages 295-302)

Persist the provider record and map these groups:

- Identity/location: `id`, name, company, base, start/end location, model,
  category, builder.
- Capacity/layout: cabins, crew cabins, berth counts, WC counts, cabin
  definitions, crew capacity.
- Technical specs: length, beam, draft, build/refit year, engines, power,
  fuel, tank capacities, steering/sail/propulsion types, hull colour,
  rudder blades.
- Commercial/operational: deposit, deposit when insured, commission,
  max-discount settings, charter and crewed type, one-way periods,
  check-in periods and minimum duration.
- Content/media: main picture, ordered picture URLs, layout image, equipment,
  multilingual comments/notes, ratings (`euminia`).
- Seasonal data: services and additional equipment, conditions and prices.

`listing_media` needs source provider, external media URL, role (`main`,
`layout`, `gallery`), sort order, dimensions if known, import time and an
optional Cloudinary asset ID. Do not assume rights to copy/hotlink media until
the provider terms confirm it.

### 2.2 Reservation and availability - PDF pages 72-117

All calls are under `/CBMS-external/rest/yachtReservation/v6/`.

| Section | Purpose | Marketplace use |
| --- | --- | --- |
| All reservations | Reservations made by the agency/operator; filterable by period, IDs and modification time | reconciliation job, booking status refresh, audit |
| All options | Provider holds/options and waiting options | reconcile expiring checkout holds |
| Free yacht / Free yachts search | Date-specific available boats with price, discounts, extras and payment plan | primary live search and quote candidate source |
| Free-yacht search criteria | Available facets for provider inventory | build filter facets; cache them |
| Occupancy, Occupancy2, Occupancy3 | Occupied periods by company/year or individual yacht | detail-page calendar and background availability refresh |
| Free cabin package search criteria/search, Cabin Charter Occupancy | Cabin-charter products | later extension; isolate from yacht booking model |
| Waiting options | Queue position/count for an unavailable boat | later UX; cannot substitute a confirmed quote |
| All infos, all stornos, all extras | Reservation lifecycle exports | provider reconciliation and internal support |
| Reservation exports | CSV-style exports and cancellation exports | finance/support back-office only |

#### Availability request requirements

`RestFreeYachtsRequest` and `RestFreeYachtsSearchRequest` accept dates,
geography, company, yacht category/model/builder, equipment, price range,
guest count, booking type, currency, sort and multiple periods. Dates must obey
the yacht's check-in/check-out and minimum-duration constraints. The response
can include `FREE` and `UNDER_OPTION` states, provider discounts, obligatory
extras, payment plans, deposit and date-specific prices.

Canonical API objects:

- `AvailabilitySearch`: check-in/check-out, destination/filter IDs, guests,
  currency, sort and pagination.
- `AvailableOffer`: canonical listing/source ID, period, available state,
  validated-at timestamp, base, display price, currency and quote-required flag.
- `AvailabilityCalendar`: date/range availability, allowed arrival/departure
  days, min/max duration, one-way rules and freshness timestamp.

Do not cache a successful availability result as a booking guarantee. Every
checkout quote re-runs the provider query.

### 2.3 Booking operations - PDF pages 118-133

Calls are under `/CBMS-external/rest/booking/v6/`.

| Operation | NauSYS object(s) | Canonical action |
| --- | --- | --- |
| Add extras | `RestYachtReservationExtrasAddRequest` | add selectable services/equipment to a provider option/booking |
| Create booking | `RestYachtReservationBookingRequest` | confirm provider reservation after payment policy permits it |
| Create cabin booking/info/option | Cabin reservation requests | later cabin-charter flow |
| Create info | `RestYachtReservationInfoRequest` | create reservation information/draft; provider-specific pre-booking stage |
| Create option | `RestYachtReservationOptionRequest` | reserve a temporary provider hold with expiry |
| Online payment / payment plan | online-payment requests/responses | provider payment integration; do not conflate with Stripe until commercial flow is agreed |
| Storno option | provider option cancellation | release a hold after expiry/customer cancellation |
| Update extras | extras update request | recalculate quote after selections change |

### 2.4 Crew, invoices and contacts - PDF pages 134-153

| Area | Use | Data handling |
| --- | --- | --- |
| Crew list | Retrieve/set passenger/crew manifest | collect only after booking when provider requires it; restrict access and audit mutations |
| Invoices/linked documents | Provider invoice and document retrieval | store metadata and provider reference; use object storage for permitted copies |
| Contacts2 | Create, list, read, merge and update provider contacts | map a local customer to `provider_contact`; do not sync provider contacts into user accounts |
| Deprecated Contacts | Legacy contact endpoints | do not implement; use Contacts2 |

Passenger/contact fields can include name, address, birth date, nationality,
email, telephone, document/passport-related data and crew-specific attributes.
Treat this as sensitive personal data: encrypt at rest where stored, minimize
retention, redact application logs, and never return it in generic profile or
booking-list procedures.

## 3. Data structure families - PDF pages 154-357

The PDF defines 169 `Rest*` types. They are grouped below so the connector can
be complete without leaking the vendor model into the application.

### Authentication and common result types

- `RestAuthentication`, `RestResponse`, `RestStatus`, international text and
  list wrappers.
- Every connector call records request correlation ID, endpoint, start/end time,
  sanitized status/error, provider request ID where present and raw encrypted
  payload reference.

### Reference/catalogue types

- Geography: `RestCountry`, `RestCountryState`, `RestRegion`, `RestLocation`
  and list wrappers.
- Business entities: `RestCharterCompany`, `RestCharterBase`, `RestUser`,
  `RestGroupPolicy`, `RestLeadSources`, `RestReservationTag`.
- Yacht taxonomy: `RestYachtBuilder`, `RestYachtModel`, `RestYachtCategory`,
  `RestEngineBuilder`, `RestSailType`, `RestSteeringType` and lists.
- Amenity taxonomy: `RestEquipment`, `RestEquipmentCategory`, `RestService`,
  `RestPriceMeasure` and lists.
- Commercial configuration: `RestSeason`, `RestPriceList`, columns, rows,
  periods, `RestDiscount`, `RestDiscountItem`, `RestPaymentPlan`.

### Yacht/listing types

- `RestYacht`, `RestYachtList`, `RestYachtModel`, `RestYachtPicture`,
  `RestYachtCabinDefinition`, `RestYachtEquipment`, `RestYachtCheckInPeriod`,
  `RestOneWayPeriod`, `RestYachtSeason`, `RestEuminia`.
- Provider extras: `RestYachtServicePrice` and
  `RestYachtAdditionalEquipmentPrice`. Preserve quantity, amount, currency,
  price measure, calculation type, tax/VAT, min/max duration, validity dates,
  pax/base constraints, required/on-request status and condition text.

### Search and availability types

- Requests: `RestFreeYachtsRequest`, `RestFreeYachtsSearchRequest`, search
  criteria and period types.
- Results: `RestFreeYacht`, lists/search response, occupancy records, waiting
  option request/response.
- Key price fields: list price, agency price, client price, localized final
  price, payment currency, discount items, payment plans, obligatory extras,
  security deposit and availability status.

### Reservation and booking types

- Core: `RestYachtReservation`, list/request/export types,
  `RestYachtReservationPriceInfo`, `RestYachtReservationInfoRequest`,
  `RestYachtReservationOptionRequest`, `RestYachtReservationBookingRequest`.
- Extras: reservation service/equipment/extra types and add/update/list
  requests.
- Financial: reservation payment, payment plan, online-payment request/response.
- Logistics: passenger, crew list and contact types.

### Additional vendor-only families

Cabin charter, warehouse transfers, maintenance and low-level operator
administration are documented in the PDF. Keep their payloads supported by a
generic raw-record/import mechanism, but do not add public marketplace tables
or oRPC procedures until the product includes those workflows.

## 4. Canonical database model

### Provider/provenance

- `provider`: `id`, code (`nausys`, `booking_manager`), enabled state,
  configuration reference.
- `provider_record`: provider, resource type, external ID, raw payload reference,
  source hash, source modification time, imported time, active/deleted state.
- `sync_run` and `sync_error`: provider, job type, cursor/window, counts,
  timestamps, status, sanitized error and retry state.
- `listing_source`: canonical listing, provider record, external yacht ID,
  external company/base IDs, source status, match confidence, reviewed-by/time.

### Catalogue and listing read model

- `operator`, `country`, `region`, `location`, `base`.
- `listing`: stable public slug/ID, type, display title, canonical source choice,
  published state, primary source and freshness.
- `listing_specification`, `listing_cabin`, `amenity`, `listing_amenity`,
  `listing_media`, `listing_checkin_rule`, `listing_one_way_rule`.
- `provider_listing_price_list` and `provider_extra_catalogue` for audit and
  page content; not for a final transaction amount.
- `listing_duplicate_candidate`: pair of source listings, matching signals,
  confidence, decision and reviewer audit trail.

### Customer, price and booking

- `wishlist`: authenticated user + canonical listing; unique pair.
- `quote`: listing/source, requested dates/guests/currency, provider quote
  reference, immutable price snapshot, selected/obligatory extras, discounts,
  payment schedule, deposit, expiry and validation timestamp.
- `price_adjustment_rule`: internal-only scope (listing, source, operator,
  destination or explicit group), date interval, priority, fixed/percentage
  adjustment, currency, stackability, enabled state and audit fields.
- `booking`: user/customer, quote, provider source, travel dates, status,
  provider reservation ID/UUID, booking reference, cancellation data and
  immutable commercial snapshot.
- `booking_extra`, `booking_traveller`, `payment_schedule`, `payment`,
  `provider_reservation_event`, `audit_log`.

Use integer minor units plus ISO currency for money. Keep percentages as exact
decimals. Store dates as dates and provider times as time values; normalize
event timestamps to UTC.

## 5. Price and duplicate precedence

1. Show a canonical listing only once when a reviewed `listing_source` match
   exists; otherwise show sources as separate listings.
2. Prefer Booking Manager media when both linked sources provide it; retain a
   per-field `selected_source` decision so the preference can be revised.
3. Never merge price or availability from two sources. A selected offer has one
   provider source, and its quote, option and booking remain with that source.
4. The displayed card price may be cached and labelled by a freshness timestamp.
   Checkout always fetches a new provider quote.
5. Apply internal `price_adjustment_rule` to the validated provider sell price.
   Persist provider amount, adjustment breakdown and customer final amount in
   the immutable quote snapshot.
6. Never expose agency price/commission unless the business explicitly requires
   it for an internal admin role.

## 6. Booking state model

`DRAFT -> QUOTED -> OPTION_PENDING -> OPTION_HELD -> PAYMENT_PENDING ->
CONFIRMING -> CONFIRMED`

Terminal/side states: `QUOTE_EXPIRED`, `OPTION_EXPIRED`, `PAYMENT_FAILED`,
`PROVIDER_REJECTED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`.

- Use an idempotency key for every user-initiated checkout action and Stripe
  webhook event.
- Lock the quote/booking row during confirmation; do not create two provider
  options for the same user action.
- Option expiry is provider-owned when supplied; otherwise do not promise a
  hold. Run a release/reconciliation job for expired holds.
- Stripe success is not booking confirmation. Confirm only after the provider
  booking mutation succeeds; implement compensating refund/manual-review paths
  for payment-success/provider-failure.
- Deposit versus full payment is a quote/payment-policy decision, not a global
  hard-coded 50/100 rule. NauSYS may return provider payment plans.

## 7. Initial implementation order

1. Add canonical schema, provider provenance tables, source-link review fields,
   fixture data and `MockInventoryProvider`.
2. Add read-only oRPC contracts: search facets/results/map, listing detail and
   availability calendar. Make them provider-neutral.
3. Add quote creation/revalidation and internal price-adjustment evaluation;
   return an immutable quote and expiry.
4. Add authenticated wishlist/profile procedures.
5. Add option, booking, payment and cancellation state-machine tables and
   procedures against the mock provider and Stripe test mode.
6. Implement `NausysProvider` once credentials, commercial terms and rate-limit
   guidance arrive. Start with catalogue sync and availability/quote, then
   options/bookings, then contacts/crew/invoices as needed.
7. Add scheduled sync/reconciliation, structured logs, provider metrics and
   alerts before enabling live booking.

## 8. Vendor questions required before production

- Agency credential permissions: which endpoints can create options/bookings,
  add extras, access invoices and manage contacts?
- Authentication/security, rate limits, pagination, bulk catalogue capability,
  timeouts and retry guidance.
- Freshness guarantees and any webhook/event mechanism for price, availability,
  options and cancellations.
- Exact option expiry, cancellation and payment semantics; whether an option
  locks price and availability.
- Meaning and use of client, agency and list price; commissions, VAT, currency
  conversion and allowed agency discounts.
- Stable yacht/operator IDs and fields sufficient to safely match records with
  Booking Manager.
- Rights and caching rules for images, descriptions, ratings and invoices.
- Required customer/crew fields, retention requirements and data-processing
  terms.

## 9. Deliberate MVP exclusions

Do not implement cabin charter, warehouse transfers, maintenance, operator user
administration, legacy Contacts endpoints, provider online-payment handling or
owner accounts unless the product scope changes. Preserve raw provider records
so these extensions remain possible later.
