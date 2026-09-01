# NauSYS API v6 - backend integration map

Source: `NAUSYSAPIV6-200726-1620-102_Agency.pdf` (358 pages, Agency API edition).

> **Canonical model:** [`backend-architecture.md`](./backend-architecture.md) is the authoritative shared vocabulary and data model for both providers. This document is the **NauSYS connector-specific reference** — it maps NauSYS endpoints/`Rest*` types onto the canonical names defined there (`listing`, `provider_record`+`listing_source`, `operator`, `amenity`, `booking`, `price_adjustment_rule`, …). Where naming here predates the reconciliation (e.g. `operator`/`provider_record`/`booking`), the canonical doc wins.

This is an implementation map, not a copy of the vendor PDF. It identifies every
documented API area and data-structure family, its purpose, and how it maps into
the YachtSkanner marketplace. The connector must keep all provider payloads and
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

### Connector interface

The authoritative definition is `packages/providers/src/provider.ts`; see
[`backend-architecture.md`](./backend-architecture.md) §4.2 for the annotated
version. Four things about it are NauSYS-driven and worth stating here:

- `syncCatalogue` is an `AsyncIterable<RawEntity>`, not a paged `Promise<SyncPage>`.
  NauSYS catalogue endpoints are full dumps with no cursor, so paging would be a
  fiction; the stream also carries scope-completion events, which is what makes the
  removal sweep safe (§4.1 below).
- `projectCatalogue(records)` is a separate pure pass. A yacht references company,
  base and equipment records that arrive in earlier batches, so projection cannot
  run while streaming.
- `confirmBooking` takes the same `BookingDraft` as `createOption`, with a
  `reservation` field carrying `{providerReservationId, securityToken}` from the
  hold. NauSYS `createBooking` needs `{id, uuid}` and nothing else identifies it.
- `cancelOption(ref)` returns the reservation rather than `void`, and the ref
  carries the rotating `uuid` (§2.3).

Implement `MockInventoryProvider` first. `NausysInventoryProvider` adapts the
endpoints below to this interface. A later `BookingManagerProvider` implements the
same contract. The oRPC layer depends on the interface, never on NauSYS structures.

### Constraints the vendor imposes on any implementation

1. **Background sweeps must be strictly sequential per credential; live calls need
   not be.** The vendor's implementation guidelines state that parallel requests
   are not allowed, and NauSYS narrowed that in writing (Aug 2026): "all live calls
   from the customer regarding booking flow will not be affected by parallel
   request restriction." So the connector runs three kinds of lane, all keyed off
   the credential (`client.ts`, `NausysLane`): `sync` is the single serialized lane
   the rule governs, carrying catalogue dumps and occupancy sweeps;
   live availability and quote calls are unserialized; and calls that touch one
   reservation serialize per reservation, which is our own constraint rather than
   the vendor's (the `uuid` in §1.4 rotates on every write). A multi-hour catalogue
   sync therefore no longer queues in front of a checkout price check, and a
   sync-only second credential is no longer needed.
2. **Errors arrive as HTTP 200** with `{"status": "<CODE>", "errorCode": <n>}`.
   HTTP status alone tells you nothing.
3. **The booking chain is `createInfo` → `createOption` → `createBooking`** and no
   step may be skipped. `createInfo` does not block the yacht; `createOption` does.
4. **The reservation `uuid` is a rotating security token**, reissued whenever
   reservation data changes. Every response must be re-read for it and the new
   value persisted, or the next call on that booking fails.
5. **No delta API and no tombstones**, so removals are detected by stamp-and-sweep
   scoped to a cleanly fetched dump, never on a partial one.

## 2. API surface map

### 2.1 Catalogue - PDF pages 16-71

All catalogue calls are POST endpoints under
`/CBMS-external/rest/catalogue/v6/` and use provider authentication. They feed
local import tables and canonical read models.

| Vendor endpoint / section                                           | Provider data                                                                    | Marketplace mapping                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `cabins/{charterCompanyId}`                                         | Cabin IDs, position, type                                                        | `listing_cabin` only for cabin-charter support; not required for bareboat MVP                          |
| `charterBases`                                                      | Base, location/company IDs, check-in/out time, coordinates, disabled dates/notes | `base`; map coordinates to map pins and booking handover details                                       |
| `charterCompanies`                                                  | Operator identity, address/contact, tax/bank details                             | `operator`; retain sensitive financial fields only in encrypted raw payload unless business needs them |
| `countries`, `countryStates`, `regions`, `locations`                | Geographic hierarchy and localized labels                                        | `country`, `region`, `location`; normalize for filters and destination pages                           |
| `discountItems`                                                     | Provider discount definitions                                                    | `provider_discount_definition`; snapshot applied discounts into quotes                                 |
| `engineBuilders`, `yachtBuilders`, `yachtModels`, `yachtCategories` | Taxonomy/model metadata                                                          | normalized lookup tables or provider taxonomies; expose selected names to filters/details              |
| `equipment`, `equipmentCategories`                                  | Amenity taxonomy                                                                 | `amenity`, `amenity_category`, `listing_amenity`                                                       |
| `leadSources`, `reservationTags`, `users`, `domains`                | Provider CRM/operator administration                                             | do not expose; retain only if required for agency reservation attribution or internal support          |
| `packages`                                                          | Cabin-charter package metadata                                                   | later `charter_package`; out of bareboat MVP unless Figma includes it                                  |
| `priceLists`, `priceMeasures`, `seasons`                            | Seasonal list-price configuration and units                                      | `provider_price_list` for audit/import only; live quote is the sellable price source                   |
| `sailTypes`, `steeringTypes`                                        | Yacht characteristics                                                            | lookup values used by yacht specifications and filters                                                 |
| `yachts/{companyId}` and `yacht/{yachtId}`                          | Full yacht catalogue record and images                                           | `provider_listing` plus derived canonical `listing`, `listing_media`, specs and constraints            |

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

| Section                                                            | Purpose                                                                                   | Marketplace use                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| All reservations                                                   | Reservations made by the agency/operator; filterable by period, IDs and modification time | reconciliation job, booking status refresh, audit        |
| All options                                                        | Provider holds/options and waiting options                                                | reconcile expiring checkout holds                        |
| Free yacht / Free yachts search                                    | Date-specific available boats with price, discounts, extras and payment plan              | primary live search and quote candidate source           |
| Free-yacht search criteria                                         | Available facets for provider inventory                                                   | build filter facets; cache them                          |
| Occupancy, Occupancy2, Occupancy3                                  | Occupied periods by company/year or individual yacht                                      | detail-page calendar and background availability refresh |
| Free cabin package search criteria/search, Cabin Charter Occupancy | Cabin-charter products                                                                    | later extension; isolate from yacht booking model        |
| Waiting options                                                    | Queue position/count for an unavailable boat                                              | later UX; cannot substitute a confirmed quote            |
| All infos, all stornos, all extras                                 | Reservation lifecycle exports                                                             | provider reconciliation and internal support             |
| Reservation exports                                                | CSV-style exports and cancellation exports                                                | finance/support back-office only                         |

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

| Operation                        | NauSYS object(s)                       | Canonical action                                                                          |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Add extras                       | `RestYachtReservationExtrasAddRequest` | add selectable services/equipment to a provider option/booking                            |
| Create booking                   | `RestYachtReservationBookingRequest`   | confirm provider reservation after payment policy permits it                              |
| Create cabin booking/info/option | Cabin reservation requests             | later cabin-charter flow                                                                  |
| Create info                      | `RestYachtReservationInfoRequest`      | create reservation information/draft; provider-specific pre-booking stage                 |
| Create option                    | `RestYachtReservationOptionRequest`    | reserve a temporary provider hold with expiry                                             |
| Online payment / payment plan    | online-payment requests/responses      | provider payment integration; do not conflate with Stripe until commercial flow is agreed |
| Storno option                    | provider option cancellation           | release a hold after expiry/customer cancellation                                         |
| Update extras                    | extras update request                  | recalculate quote after selections change; **quantity 0 removes a line**                  |

#### Extras: ids, removal and the editable flag

Confirmed by NauSYS, Aug 2026, and implemented in `nausys/booking.ts`:

- `addExtras` takes the **season/catalogue** `serviceId` from the
  `freeYachts`/`freeYachtsSearch` response. `updateExtras` takes the reservation
  line's own `yachtReservationServiceId`. Two id spaces, one per call.
- `updateExtras` is a **partial** update — unnamed lines keep their current
  quantity — so the desired set is diffed rather than replayed.
- **Removal is `updateExtras` with `quantity: 0`**, which drops the line from the
  info and the option. There is no separate delete endpoint and no need to storno
  and rebuild the reservation.
- Each line carries an **`editable`** flag. A line the operator locked cannot be
  changed, so a removal it blocks fails loudly instead of leaving a deselected
  extra on the bill.
- **Extras cannot be edited once the booking is confirmed.** Only the vendor knows
  the reservation's current status, so that refusal arrives as a classified
  provider error rather than a local guard.

#### Extras pricing

`amount` is the **unit price**, `quantity` the multiplier, and `totalPrice` the
line total. NauSYS confirmed this twice (Aug 2026), the second time adjudicating
their own documentation example — a `quantity: 10` extra that raises
`totalPriceWithExtras` by one times `amount` — as a documentation mistake they will
correct. The recorded response `{amount: "10.00", quantity: "10.00", totalPrice:
"100.00"}` bills the customer 100.00. The connector uses `totalPrice` where the
vendor sends it and `amount x quantity` where it does not.

#### The one change feed: reservations by modify time

`RestYachtReservationsRequest` takes `modifyTimeFrom`/`modifyTimeTo` (`dd.MM.yyyy HH:mm`, in
the vendor's own CET/CEST), and `RestYachtReservation` carries `lastModifiedAt`. That is the
whole of what NauSYS offers as a change feed — no webhook, no events — and nothing here read
it, so an operator cancelling or moving a charter left our booking saying what it said the day
it was made. `listChangedNausysReservations` now backs a scheduled reconciliation pass; the
window, what it writes and what it deliberately refuses to write are in `docs/scheduled-jobs.md`.

Also on that request and unused: `endDateFrom`/`endDateTo` (check-out window),
`includeWaitingOptions`, `canceledType` (obligatory for the storno export), `displayCurrency`
and the two cabin-charter filters.

#### Extras availability conditions

A priced extra is filed **per condition**, not per extra: `RestYachtServicePrice` and
`RestYachtAdditionalEquipmentPrice` each carry `validForBases`, `minDuration`/`maxDuration`,
`validPeriodFrom`/`validPeriodTo`, `validMinPax`/`validMaxPax` and `minimumPrice`. Measured
against the live catalogue (8 companies, ~89 MB, Sep 2026): **130,535 of 184,539 extras rows
name the bases they apply at**, 2,047 name a charter length, 855 name a date window; none in
that sample carried a pax range or a minimum price.

Reading a row as unconditional charged cards for fees no charter from that base pays. The
projection now carries the conditions through (`validForBaseIds`, `validNightsFrom`/`To` from
the day range **minus one**, since the vendor counts the calendar days the boat is held, and
`seasonStart`/`seasonEnd` from the valid period), and both readers — the card's fee totals in
`search/read-model.ts` and the detail page's extras in `search/repository.ts` — drop a row
whose bases exclude the base it was filed under.

Only one row per extra can be stored, because `provider_extra_catalogue` is keyed on the
vendor's own id and NauSYS reuses one `serviceId` across every variant. Which one survives is
therefore a decision: a row that applies at the yacht's own base beats one that does not, then
the row whose window runs latest (which is how an expired variant loses without the projection
needing a clock), then the newest season, as before.

`validMinPax`/`validMaxPax` are deliberately not stored. Nothing that displays a catalogue
extra knows the party size — the card is per listing, and the checkout is priced by the vendor
— so the column could not be honestly consulted. `minimumPrice` is stored but unread: the card
sums percentage fees into a single rate and multiplies once, and a per-fee floor cannot survive
that sum.

#### Deposit insurance

`RestService.depositInsurance` marks the service that lowers the deposit, and the yacht carries
`depositWhenInsured` beside `deposit` (724 yachts in the sample); the offer carries
`depositWhenInsuredAmount` beside `depositAmount`. All of it was parsed and none of it read, so
a customer who bought the insurance was still shown the full deposit — and would have had the
full amount blocked at the base. The projection now flags the extra
(`provider_extra_catalogue.deposit_insurance`) and stores the reduced figure, and the quote
holds the reduced deposit when the charter carries one of those extras.

#### Reading a reservation's extras: `listExtras`

`yachtReservation/v6/listExtras` (added Oct 2025) takes `{id, uuid}` and returns
`addedServices`, `addedEquipment` and `availableExtras` with `editable`, `obligatory`,
`onPending` and `quantityExtras`. It is the single-reservation read whose absence the extras
diff was written around, and nothing supplied the fallback loader — so the diff ran against an
empty reservation, found nothing to remove, and **left a deselected extra on the booking still
being billed**. `addOrUpdateExtras` now reads it by default, on the reservation's own lane so
the read cannot answer from before the write it informs. Services only: removal is keyed by the
reservation line id and `updateExtras` addresses services.

### 2.4 Crew, invoices and contacts - PDF pages 134-153

| Area                      | Use                                                    | Data handling                                                                                      |
| ------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Crew list                 | Retrieve/set passenger/crew manifest                   | `crewlist/v6/get` for the operator's requirements, `crewlist/v6/set2` to file the list (see below) |
| Invoices/linked documents | Provider invoice and document retrieval                | store metadata and provider reference; use object storage for permitted copies                     |
| Contacts2                 | Create, list, read, merge and update provider contacts | map a local customer to `provider_contact`; do not sync provider contacts into user accounts       |
| Deprecated Contacts       | Legacy contact endpoints                               | do not implement; use Contacts2                                                                    |

Passenger/contact fields can include name, address, birth date, nationality,
email, telephone, document/passport-related data and crew-specific attributes.
Treat this as sensitive personal data: encrypt at rest where stored, minimize
retention, redact application logs, and never return it in generic profile or
booking-list procedures.

#### Crew list: collected here, filed with the operator

**Answered (NauSYS, Aug 2026); the link is now carried end to end.** The vendor's
answer settles who wants the manifest and why: the crew list is required by the
**charter company**, not by NauSYS, because the authorities require it of them — the
same obligation as a hotel check-in. If it is not complete on arrival, the base
collects it there; nothing about the booking itself fails. And **forwarding the
customer the reservation's `crewlistlink` is explicitly acceptable** in place of
posting the data ourselves through `crewlist/v6/set2`.

That is worth taking, because collecting it ourselves is the more expensive half:
`requiredFields` varies per reservation and the vendor performs no API-side
validation, so a partial list is accepted silently and we would be telling customers
they are done without any confirmation the operator agrees.

**What is built.** `crewListLinkOf` in `nausys/endpoints.ts` reads the link off a
reservation response, `ProviderReservation.crewListLink` carries it, the hold and the
confirmation both persist it to `booking.crew_list_link` (migration 0042), and
`booking.get` returns it as `crewListLink`. Two things about the read are worth
knowing:

- **The spelling is confirmed: `crewlistlink`, all lower case.** Verified against the
  live account with `scripts/probe-crewlist-link.ts` (`pnpm --filter
@yacht-charter/providers probe:crewlist`), a read-only pass over
  `yachtReservation/v6/reservations`: 849 of 851 reservations carry it, and the value
  is `https://crew.nausys.com/<reservationId>/<token>/`. The reader still matches the
  key case-insensitively, which now costs nothing and covers the vendor changing
  convention. The 2 without one are `RESERVATION`s that simply have no link.
- **Only http(s) values survive.** The string becomes a link a customer clicks, so
  the scheme is checked here rather than trusted; anything else is dropped. A
  malformed link never fails the confirmation itself — the field is optional all the
  way through, because a bad URL must not reject a charter that is already paid for.

**Found while verifying this.** The same probe turned up a live parse failure with
nothing to do with crew lists: `client.company` comes back as a bare `true` on a
client that is a company, and `restClientSchema` rejected any boolean but `false`.
Three of 851 reservations answer that way, and on the booking path an unparseable
response is a charter the vendor accepted that we would record as
provider-rejected. `company` now reads a boolean as "no company name".

**Decided (Aug 2026): we do not forward the link.** The customer fills the crew list
in on our own booking page — a panel on `/bookings/[id]` over the
`booking.travellers.*` procedures — and we submit it to the operator ourselves. So
`crewListLink` stays stored and exposed but nothing renders it; it is the fallback if
the submission turns out to be unavailable to our credential.

**Built (Sep 2026); the earlier 404s were the wrong shape, not a missing endpoint.**
`crewlist/v6` takes the reservation id and its security token as **path segments** —
`/CBMS-external/rest/crewlist/v6/get/{reservationId}/{securityCode}` — so the calls that
probed `/CBMS-external/rest/crewlist/v6/…` without them had no reservation to answer about,
and 404 was the correct reply. The token is the authorisation: these two calls carry no
credentials at all, and the value is the `uuid` that also rides in `crewlistlink`.

- **`get` — what this operator requires.** `fetchNausysCrewRequirements` in
  `nausys/crew-list.ts` returns `requiredFields`, `maxPassengers` and `insertSkipper`. The
  spec is explicit that the vendor validates none of it: "There is no validation on the API
  side so it is possible to send only some of these fields." Verified live with
  `scripts/probe-crew-list.ts` (`pnpm --filter @yacht-charter/providers probe:crew-list`), a
  read-only pass: three companies answered, each requiring 14-15 fields, and they do not
  agree on the names — two asked for `documentType`/`documentNumber`, the third for
  `identificationDocumentType`/`identificationDocumentNumber`, meaning the same passport. The
  panel treats them as aliases and marks the field either way.
- **`set2` — filing the list.** `submitNausysCrewList` posts `RestCrewlist2`. `set2` rather
  than `set` because only `set2` answers a rejection with `invalidPeriodFrom`/`invalidPeriodTo`
  — the charter days the manifest fails to cover — which is the difference between telling a
  customer what to fix and telling them it did not work. `CREW_LIST_VALIDATION_FAILED` (303)
  and `CREW_LIST_LOCKED` (301) come back as receipts rather than exceptions; anything else
  throws, because the list reached nobody.

**What the adapter converts.** The vendor wants `dd.MM.yyyy` dates and **alpha-3** country
codes; every country field in this codebase is alpha-2. The map comes from the vendor's own
`catalogue/v6/countries` (`code` is alpha-3, `code2` alpha-2), fetched once per client and
kept, so a customer pressing Save does not wait on a catalogue dump. A code we cannot map is
omitted rather than guessed. Birth and residence places for Croatia are supposed to match the
vendor's `crewlist/places` list; we send what the customer typed, and the operator corrects it.

**The enum endpoints are public.** `crewlist/countries` (alpha-3 + name), `crewlist/documents`
(`PASSPORT`, `IDCARD`, `OTHER` — exactly what the form offers) and `crewlist/places` answer over
plain GET with no credentials. The last one matters: the specification says a Croatian place of
birth or residence "must be one from the list of known places in Croatia", and the API validates
nothing, so a freehand "Split" is accepted on the wire and questioned at the desk. The list is
6,851 names and 360 KB — fetched once per process, searched server-side through
`booking.travellers.places`, and offered as a combobox on the panel whenever the chosen country
is Croatia. Prefix matches rank first and the municipality rides in the label, because dozens of
these names repeat.

**Storage.** `booking_traveller` carries the split name and the fields the operators asked for
(migrations 0082/0083); the identifying ones — date of birth, document number, birth and
residence place, and the skipper's licence, email and phone — are encrypted with the same PII
codec as before. The outcome of the last submission lives on the booking itself
(`crew_list_submitted_at`, `crew_list_accepted`, `crew_list_message`), because NauSYS accepts
or refuses the manifest as a whole. The save commits before the submission runs and is never
undone by it: a customer who typed their passport details has done their part whatever the
vendor answers.

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
7. **`price.clientPrice` is the final customer amount, VAT included.** NauSYS
   confirmed (Aug 2026) that the charter company configures the calculation on
   its price list and that "the client price is the one you need to charge the
   client without any additional calculation on your side". So nothing is added
   to it: no VAT step, no rounding, no conversion. `vatInPrice` on a
   `catalogue/v6/priceLists` entry still varies per list, but that is the
   catalogue-derived "from" price on a card, not the amount anyone is billed.
8. **A discount we grant comes out of our commission, capped by
   `maxDiscountFromCommission`.** That is the binding field, not `maxDiscount`:
   the vendor's answer is that a broker "can give up to the amount in
   maxDiscountFromCommission". The minimum sale price is therefore
   `clientPrice − (our discount, ≤ that cap)`. Whether the field is an amount or a
   percentage is the one part still to pin down; NauSYS has a documentation update
   coming and will tell us when it lands.

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

## 8. Vendor questions

### Answered (NauSYS, Aug 2026)

Each answer is implemented where it touches code; the citation lives next to the
code it justifies.

| Question                                     | Answer                                                                                                                                                                                      | Where it landed                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Is `amount` a unit price or the line total?  | Unit price; `totalPrice` = `amount` x `quantity`. The contrary example in their documentation is a mistake they will fix.                                                                   | §2.3, `nausys/quote.ts`                             |
| How is an extra removed?                     | `updateExtras` with `quantity: 0`; honour `editable`; no edits after confirmation. `addExtras` takes the season id, `updateExtras` the reservation line id.                                 | §2.3, `nausys/booking.ts`                           |
| Is `clientPrice` the final customer amount?  | Yes, VAT included, nothing to add on our side.                                                                                                                                              | §5.7                                                |
| Which field caps an agency discount?         | `maxDiscountFromCommission`, drawn from our commission. Units pending their documentation update.                                                                                           | §5.8                                                |
| Must every call on one credential be serial? | No — live booking-flow calls are exempt; the restriction covers the background sweeps.                                                                                                      | §1 constraint 1, `nausys/client.ts`                 |
| Is `countryId` in `createInfo` a NauSYS id?  | Yes, the `catalogue/v6/countries` id, matched via `code2` — not an ISO code.                                                                                                                | `nausys/booking.ts`, `shared/catalogue-resolver.ts` |
| Must we build crew lists ourselves?          | No, but we do. The base collects it on arrival if it is incomplete, and forwarding `crewlistlink` is acceptable; we collect it on our own page and file it with `crewlist/v6/set2` instead. | §2.4                                                |

### Still open

- **Test-account credentials.** `ws-test.nausys.com` is live and answers in the
  vendor's own envelope, but our credential is production-only: it earns
  `AUTHENTICATION_ERROR` (100) there on `catalogue/v6/countries`, which needs no
  special permission. Until NauSYS issues a test login, the booking chain can only be
  exercised against real inventory — so ask for one before anything calls
  `createInfo`.
- **Agency credential permissions** — which endpoints our credentials may call:
  create options/bookings, add extras, access invoices, manage contacts.
- **Rate limits, pagination, timeouts and retry guidance**, now that sequencing is
  settled; and whether any bulk/delta catalogue endpoint exists.
- **Freshness guarantees and webhooks/events** for price, availability, options and
  cancellations, or whether polling is the only option.
- **Exact option expiry and cancellation semantics** — whether an option locks
  price as well as availability, cancellation windows, penalties, who may cancel.
- **`maxDiscountFromCommission` units** — amount or percentage (their
  documentation update).
- **Stable yacht/operator IDs** sufficient to safely match records with Booking
  Manager.
- **Rights and caching rules** for images, descriptions, ratings and invoices.
- **Retention and data-processing terms** for the customer data we do send
  (`createInfo`: name, email, phone, country) and invoice ownership.

## 9. Deliberate MVP exclusions

Do not implement cabin charter, warehouse transfers, maintenance, operator user
administration, legacy Contacts endpoints, provider online-payment handling or
owner accounts unless the product scope changes. Preserve raw provider records
so these extensions remain possible later.
