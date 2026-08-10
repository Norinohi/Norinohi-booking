# Yacht-Charter Marketplace — Backend Architecture & Implementation Plan

**Owner:** Daria (backend lead) · **Status:** design, pre-implementation · **Scope:** M2 → M6 demo, with clean extension points for live Booking Manager / NauSYS connectors, Stripe live mode, and operator roles after the demo.

**Companion docs:** [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md) is the **NauSYS connector-specific reference** (real endpoints, `Rest*` types, page ranges, field groups). This document is the **canonical shared model** — vocabulary and modeling here are authoritative for both providers; the NauSYS map maps its endpoints _into_ the names defined here. [`task-breakdown.md`](./task-breakdown.md) is the assignable task list. [`open-questions-and-decisions.md`](./open-questions-and-decisions.md) tracks every open decision, vendor question, and assumption. [`domain-overview.md`](./domain-overview.md) explains the model in plain language for the whole team.

> Decision-oriented. Concrete recommendations even where inputs are missing; every gap is labelled **[ASSUMPTION]** and collected in §8. Cross-cutting decisions D-MONEY / D-ID / Q-ADMIN / D-TEST and the vocabulary/modeling reconciliation are **decided** (see §8).

---

## 0. Inputs reviewed & access caveats

| Input                     | Status                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing repo scaffolding | ✅ fully mapped                 | Drizzle (`text` PKs, snake_case, `(table)=>[index()]`, separate `relations()`), oRPC (`os.$context<Context>()`, plain-object `appRouter`, Zod v4 via `@orpc/zod/zod4`), Hono server, `@yacht-charter/env`. Conventions in Appendix A.                                                                                                                                                                                                                                                                                |
| Product brief             | ✅                              | Multi-operator marketplace; two provider APIs; "manage price" is internal/admin; no owner accounts.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| NauSYS API v6             | ✅ **read & confirmed**         | Full **358-page** agency PDF extracted (pure-Node `zlib`); it validates [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md) and this model. Confirmed payloads: 3 price tiers `priceListPrice`/`agencyPrice`/`clientPrice` (e.g. 3340.00/2606.97/3006.00), `securityDeposit`, `depositWhenInsured`, `paymentPlans`, `obligatoryExtras`, `regularDiscounts`, `oneWayPeriods`, `minimumShortPeriodDuration`, period status `FREE`/`UNDER_OPTION`, `displayCurrency`. Q-NAU **and** Q-PAGES closed.        |
| Booking Manager / MMK     | ⚠️ creds pending (docs in hand) | Same `InventoryProvider` contract; BM preferred for media, price/availability reconciled at quote time. **Client-confirmed:** REST API (Swagger `mmksystems/bm-api` **v2.1.4**), ~**12–13k yachts / 1300+ operators**, prices/photos/discounts/specs/real-time availability, API-key auth. Access is gated on a **commercial proposal + online T&C acceptance**, then a **1-month free trial** with full data **+ a demo fleet for test bookings**. Docs: support.booking-manager.com Rest-API section + swaggerhub. |
| Figma "Discovery" board   | ⚠️ partial                      | Screenshots render; `get_metadata` fails with an MCP transport error on this large page, so per-screen annotation text isn't extractable. Screen set read visually (matches the brief). Screen→field map in §9 is provider-driven, "validate against Figma annotations."                                                                                                                                                                                                                                             |

**Screens confirmed on the board:** home + hero search; results (list + filters + map with pins); yacht detail (gallery, specs, availability calendar, reviews, FAQ); trip-builder wizard; booking card (deposit / full-payment variants); checkout + summary + confirmation; login/registration; profile; wishlist; a referral/discount surface; a tabular price view (candidate internal price-management screen).

**Milestone tags:** `M2` schema+contracts+mock · `M3` search/availability query · `M4` availability+pricing query · `M5` booking state machine + Stripe test · `M6` observability · `later` = post-demo.

---

## 1. Domain model — entity inventory (ERD-level)

Six groups. **Canonical** = we own the truth; **provider-derived** = imported, never hand-edited except through an override. Vocabulary is the reconciled canonical set (provider-neutral names; the NauSYS map maps `Rest*` types onto these).

### 1.1 Internal canonical marketplace entities

| Entity                                           | Purpose                                                                                                                                                                                                           | M         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `listing`                                        | **Canonical yacht identity.** One row per real-world yacht; many `listing_source` map to it. Everything customer-facing references `listing`. Has `slug`, `primary_source_id`, `published` state, `freshness_at`. | M2        |
| `listing_specification`                          | Canonical spec block (length, beam, draft, year, cabins, berths, heads, engines, fuel, steering/sail/propulsion type…) copied from the primary source, admin-overridable.                                         | M2        |
| `listing_media`                                  | Ordered gallery; each item: `source`, external URL, `role` (`main`/`layout`/`gallery`), sort order, dims, import time, optional Cloudinary asset id. **BM preferred.**                                            | M2        |
| `listing_cabin`                                  | Cabin layout rows (cabin-charter support; not required for bareboat MVP).                                                                                                                                         | later     |
| `listing_checkin_rule`, `listing_one_way_rule`   | Valid check-in/out weekdays, min/max duration, one-way periods (canonical copy for the calendar).                                                                                                                 | M2        |
| `builder`, `yacht_model`, `yacht_category`       | Canonical taxonomy de-duplicated across providers.                                                                                                                                                                | M2        |
| `amenity`, `amenity_category`, `listing_amenity` | Canonical amenity/equipment taxonomy + per-listing join (obligatory/optional, price when extra).                                                                                                                  | M2        |
| `base`, `location`, `region`, `country`          | Canonical geography (marina → location → region → country) with lat/lng for map pins + check-in/out times/handover.                                                                                               | M2        |
| `operator`                                       | Canonical charter-company identity across providers. **No auth/account** (no owner accounts) — display + attribution only; sensitive financials kept only in encrypted raw payload unless business needs them.    | M2        |
| `review`, `faq`                                  | Marketplace-owned content on a listing (Figma). Seed-only for demo.                                                                                                                                               | M2 (mock) |

### 1.2 Provider-source & import/provenance entities _(reconciled: generic `provider_record` + `listing_source`)_

| Entity                        | Purpose                                                                                                                                                                                                                                                                         | M                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `provider`                    | Registry per connector: `mock`, `booking_manager`, `nausys` — enabled flag, config ref, default currency.                                                                                                                                                                       | M2                       |
| `provider_record`             | **Generic provenance row for any provider resource.** `provider`, `resource_type` (yacht/company/base/model/amenity/…), `external_id`, raw-payload ref, `source_hash`, source modification time, imported time, active/deleted. `unique(provider, resource_type, external_id)`. | M2                       |
| `provider_raw_payload`        | Immutable raw JSON exactly as returned (append-only; replay/debug/audit). Referenced by `provider_record` and booking mutations.                                                                                                                                                | M2                       |
| `listing_source`              | **Canonical `listing` ↔ provider yacht link.** `listing_id?` (nullable until matched), `provider_record_id`, external yacht/company/base IDs, `source_status`, `match_confidence`, `matched_by`, `matched_at`.                                                                  | M2                       |
| `listing_duplicate_candidate` | Pair of source listings + matching signals + confidence + decision + reviewer audit trail (backs the manual review queue).                                                                                                                                                      | M2                       |
| `sync_run`, `sync_error`      | One sync execution: provider, job type, cursor/window, counts, timestamps, status, sanitized error, retry state.                                                                                                                                                                | M2 (mock) / later (live) |
| `sync_cursor`                 | Per-provider incremental pointer (`updatedSince`/page token).                                                                                                                                                                                                                   | later                    |

### 1.3 Search / read-model entities

| Entity                      | Purpose                                                                                                                                                                    | M          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `listing_search_doc`        | Denormalised, query-optimised projection of a listing (facets + min price hint + geo) rebuilt on sync. Backs results/facets/map.                                           | M3         |
| `availability_slot` (cache) | Per-listing bookable weeks: start/end, valid check-in/out weekday, min-duration, price hint, `source`, `freshness_at`. **Cache only — never authoritative at quote time.** | M3         |
| `facet_dictionary`          | Stable enum values + i18n labels for filters (category, cabins, length bands, amenities) so the web app never hard-codes provider strings. Dynamic facets ship first.      | later/M3.5 |

### 1.4 Customer / account entities

| Entity                                       | Purpose                                                                                            | M                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| `user`, `session`, `account`, `verification` | **Exist** (Better Auth). Reshape only via `packages/auth`. `user` gains a `role` column (Q-ADMIN). | done / M2                  |
| `profile`                                    | App-owned 1:1 extension of `user`: phone, locale, currency, marketing prefs.                       | M2                         |
| `wishlist` / `wishlist_item`                 | Saved listings per user (unique user+listing).                                                     | M2                         |
| `referral` / `referral_redemption`           | Referral code per user; redemption ties a new user/booking to a referrer (Figma).                  | M2 (schema) / M4 (applied) |
| `provider_contact`                           | Maps a local customer to a provider contact (NauSYS Contacts2). **Not synced into user accounts.** | later                      |

### 1.5 Booking, pricing, payment & audit entities

| Entity                       | Purpose                                                                                                                                                                                                                                                                 | M                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `quote`                      | **Immutable priced snapshot:** listing/source, dates, guests, currency, provider quote ref, price breakdown (jsonb), selected/obligatory extras, discounts, deposit, `payment_policy`, `expires_at`, `price_source_hash`, validation timestamp.                         | M4                          |
| `quote_line`                 | Line items (base, extras, obligatory fees, deposit, discounts, provider commission).                                                                                                                                                                                    | M4                          |
| `price_adjustment_snapshot`  | Provider amount + adjustment breakdown + customer final amount, frozen into the quote.                                                                                                                                                                                  | M4                          |
| `booking`                    | **Our booking aggregate** + state machine (§6). Links `quote`, `user`, provider source, travel dates, status, `provider_reservation_id`/UUID, booking reference, immutable commercial snapshot, cancellation data. ("reservation" is reserved for the _provider_ side.) | M5                          |
| `booking_extra`              | Chosen extras snapshot on the booking.                                                                                                                                                                                                                                  | M5                          |
| `booking_traveller`          | Lead/crew manifest (name, DOB, nationality, document data). **Sensitive — see §10.**                                                                                                                                                                                    | M5 (capture) / later (push) |
| `payment_schedule`           | Installment plan for a booking: deposit now + balance later (or full). Each row: kind, amount-minor, currency, due date, status.                                                                                                                                        | M5                          |
| `payment`                    | Stripe PaymentIntent mirror: amount-minor, currency, kind, status, `stripe_payment_intent_id`, `idempotency_key`.                                                                                                                                                       | M5                          |
| `provider_reservation_event` | Append-only mirror of provider reservation lifecycle events (reconciliation).                                                                                                                                                                                           | M5                          |
| `provider_webhook_event`     | Append-only Stripe (and later provider) webhook log, deduped by event id → idempotent processing.                                                                                                                                                                       | M5                          |
| `audit_log`                  | Who/what/when for admin actions & state transitions (price overrides, matches, cancellations).                                                                                                                                                                          | M5                          |

### 1.6 Internal admin / pricing-rule entities

| Entity                    | Purpose                                                                                                                                                                                                                                                                                              | M   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `price_adjustment_rule`   | **Internal "manage price".** Adjustment for one listing OR a group over a date window: type (`percent_discount`/`percent_markup`/`fixed_delta`/`fixed_override`), value, priority, `stackable`, currency scope, active window. Applied to the **validated provider sell price**. Never owner-facing. | M4  |
| `price_adjustment_target` | Resolves a rule to targets by `listing`/`operator`/`region`/`category`/explicit set.                                                                                                                                                                                                                 | M4  |
| `discount` / `promo_code` | Marketing discounts (distinct from provider discounts and price rules); validated at quote time.                                                                                                                                                                                                     | M4  |
| `user.role`               | Marks internal staff for `adminProcedure` (Q-ADMIN = column).                                                                                                                                                                                                                                        | M2  |

---

## 2. Per-entity detail (key fields · canonical vs provider-derived · milestone)

### `listing` — canonical yacht _(M2)_

- **Fields:** `id` (`ylst_…`), `slug` (unique), `title`, `builder_id`, `model_id`, `category_id`, `home_base_id`, `operator_id`, `default_currency`, `published` (bool), `primary_source_id` (winning `listing_source` for specs), `freshness_at`, timestamps. Specs live in `listing_specification`.
- **Canonical vs derived:** identity, slug, published state, media ordering, admin overrides = **canonical**. Specs = **provider-derived** (from `primary_source_id`, overridable). Live price/availability = **never** stored.

### `listing_source` — canonical↔provider link _(M2)_

- **Fields:** `id`, `listing_id?`, `provider_record_id`, `external_yacht_id`, `external_company_id`, `external_base_id`, `source_status`, `match_confidence` (0–1), `matched_by`, `matched_at`.
- **Canonical vs derived:** the mapping decision is the only canonical part; everything else mirrors `provider_record`.

### `provider_record` — generic provenance _(M2)_

- **Fields:** `id`, `provider`, `resource_type`, `external_id`, `raw_payload_id`, `source_hash`, `source_modified_at`, `imported_at`, `active`. `unique(provider, resource_type, external_id)` — the import idempotency key.

### `availability_slot` — cache _(M3)_

- **Fields:** `id`, `listing_id`, `source`, `start_date`, `end_date`, `checkin_weekday`, `checkout_weekday`, `min_nights`, `is_one_way`, `status` (`FREE`/`UNDER_OPTION`/`occupied`), `price_hint_minor`, `currency`, `freshness_at`.
- **Provider-derived cache.** Powers calendar + fast filtering; the quote step re-validates live so a stale slot can never confirm a booking.

### `quote` — priced snapshot _(M4)_

- **Fields:** `id` (`qte_…`), `listing_id`, `source` (authoritative source used), `user_id?` (nullable/anonymous), `currency`, `check_in`, `check_out`, `guests`, `extras` (jsonb), `breakdown` (jsonb: base, discounts, provider commission, obligatory extras, optional extras, deposit, taxes, total), `total_minor`, `deposit_minor`, `payment_policy` (jsonb `{ mode:'deposit'|'full', deposit_pct, balance_due_at, currency }`), `price_source_hash`, `status` (`active`/`expired`/`consumed`), `expires_at`, `validated_at`.
- **Money:** integer **minor units** + ISO `currency` for amounts; **percentages (commission/discount/VAT) as exact decimals** (D-MONEY). Immutable — supersede with a new quote, never mutate. **[ASSUMPTION]** single currency per quote; multi-currency via re-quote.

### `booking` — booking aggregate _(M5)_

- **Fields:** `id` (`bkg_…`), `quote_id`, `user_id`, `listing_id`, `status` (§6 enum), `provider`, `provider_reservation_id?`, `provider_option_id?`, `provider_status?`, `booking_reference?`, `hold_expires_at?`, `confirmed_at?`, `cancelled_at?`, `cancel_reason?`, `total_minor`, `currency`, `commercial_snapshot` (jsonb, immutable), `idempotency_key` (unique), timestamps.
- **Canonical vs derived:** lifecycle/status = **canonical**; `provider_reservation_id`/`provider_status` = provider-derived mirrors reconciled via `provider_reservation_event`/webhooks.

### `payment_schedule` + `payment` — money _(M5)_

- `payment_schedule(id, booking_id, kind:'deposit'|'balance'|'full', amount_minor, currency, due_at, status)`.
- `payment(id, booking_id, schedule_id?, kind, amount_minor, currency, status, stripe_payment_intent_id, stripe_client_secret?(transient), idempotency_key(unique), timestamps)`.

### `price_adjustment_rule` — internal price management _(M4)_

- **Fields:** `id`, `name`, `type`, `value` (minor or exact-decimal pct), `currency?`, `priority`, `stackable`, `starts_at`, `ends_at`, `booking_window_start?`, `booking_window_end?` (**[ASSUMPTION]** travel dates), `active`, `created_by`, timestamps.
- **Targets:** `price_adjustment_target(rule_id, target_type ∈ {listing,operator,region,category,all}, target_id)`.
- **Canonical, internal-only, audited.** Applied **after** provider sell price, **before** marketing `discount`; breakdown frozen into the quote.

---

## 3. Duplicate handling (same yacht in both providers)

**Preserve every provider record, converge on a canonical identity, never auto-merge silently.**

1. **Keep source rows intact.** `provider_record` is append-updated per sync; one provider's data never overwrites another's.
2. **Canonical identity = `listing`,** with 1..N `listing_source`. In one provider → 1 source; in both → 2 sources under one `listing`.
3. **Matching is proposed, then reviewed.** A matcher scores `match_confidence` from stable signals (operator + base + model + length + year + fuzzy name; plus any stable cross-provider IDs — Q-DUP). Pairs land in `listing_duplicate_candidate`. States on `listing_source.source_status`: `unmatched` (own provisional listing) · `auto` (high-confidence, still listed for review, never published on `auto` alone) · `confirmed` (human-approved, audited) · `rejected` (won't re-propose).
4. **Field precedence (per field-group), resolved when building the canonical listing:**
   | Field group                                                                   | Winner                                                                    | Rationale                      |
   | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
   | **Media / gallery**                                                           | **Booking Manager** preferred, NauSYS fallback                            | BM has better photos.          |
   | Specs                                                                         | `primary_source_id` (default the more complete record; admin-overridable) | Deterministic.                 |
   | Amenities                                                                     | union, de-duped by canonical `amenity_id`                                 | Superset is safer for filters. |
   | **Live availability & price**                                                 | **reconciled at quote time — not merged**                                 | See §6.                        |
   | Keep a per-field `selected_source` decision so any preference can be revised. |
5. **Availability/price reconciled live, never merged.** The cache may hold hints from either source; the **quote** step calls the authoritative source and re-prices. A selected offer has exactly one provider source; its quote/option/booking stay with that source. **[ASSUMPTION]** default transacting source = lower client price at quote time, tie-break to BM — confirm (Q-DUP).
6. **No unsafe automerge.** Publishing a merged listing requires `confirmed`; all merges/splits write `audit_log`.

---

## 4. Provider abstraction

**Provider payloads and IDs stay at the connector boundary. The web app only ever sees canonical entities and oRPC DTOs.**

### 4.1 Package layout

```
packages/providers            # NEW — provider-neutral interface + implementations
  src/
    types.ts                  # canonical DTOs (AvailabilitySearch, AvailableOffer, AvailabilityCalendar,
                              #   ProviderQuote, ProviderReservation, ProviderCapabilities) — NOT provider shapes
    provider.ts               # InventoryProvider interface (below)
    mock/                     # MockInventoryProvider — fixtures-backed, ships in M2
    booking-manager/          # later
    nausys/                   # later — adapts endpoints in nausys-api-v6-backend-map.md
    mapping/                  # per-connector raw→canonical mappers
    sync/                     # sync runner, cursors, retries, idempotency
packages/db                   # schema + typed queries (existing)
packages/api                  # oRPC contract + thin handlers → services (existing seam)
```

`packages/api` handlers call domain **services** (search / availability / quote / booking / pricing) in `packages/api/src/services/*` (promote to `packages/core` only if they outgrow it). `packages/api` gains a dep on `packages/providers`, keeps its dep on `packages/db`. **`AppRouterClient` shape is invariant to which provider is active.**

### 4.2 The interface (provider-neutral — reconciled)

```ts
// packages/providers/src/provider.ts  (Zod v4 DTOs in types.ts)
export interface InventoryProvider {
  readonly key: "mock" | "booking_manager" | "nausys";

  syncCatalogue(cursor?: string): AsyncIterable<RawEntity>; // yields raw + resource_type + scope_key
  projectCatalogue(records: ProviderRecordSet): CanonicalCatalogue; // pure, no I/O
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>; // calendar for detail page
  getQuote(input: QuoteRequest): Promise<ProviderQuote>; // firm price for exact dates/extras/crewType/guests/currency
  createOption(input: BookingDraft): Promise<ProviderReservation>; // soft hold; may throw NotSupported
  confirmBooking(input: BookingDraft): Promise<ProviderReservation>; // draft carries `reservation` from the hold
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;

  capabilities(): ProviderCapabilities; // { supportsOptions, supportsWebhooks, minHoldMinutes, optionExpiryOwnedByProvider, ... }
}
```

- Return types are **canonical DTOs** validated with Zod v4 at the boundary → a malformed provider payload fails in the connector, not the web app.
- `capabilities()` lets the state machine degrade gracefully (no `createOption` → skip the hold; `optionExpiryOwnedByProvider=false` → don't promise a hold, §6).
- **Projection is a second pass** because a yacht cross-references company, base and equipment records that arrive in earlier sync batches, so it cannot be done while streaming. `syncCatalogue` ingests; `projectCatalogue` maps. Only the second is pure, and only the second is fixture-testable.
- **`ProviderReservationRef` carries a `securityToken`.** NauSYS issues a per-reservation `uuid` that rotates whenever reservation data changes, so a handle is `{providerReservationId, securityToken}`, never a bare id. `cancelOption` returns the reservation rather than `void` so the caller can persist the rotated token and the provider status.
- **`BookingDraft` carries the period, guests, extras, `crewType` and `priceSourceHash`.** The vendor's booking call needs the dates, and the hash is the only link between the price the customer agreed to and the reservation created seconds later when the provider's quote call creates no server-side artifact. `crewType` travels with it for the same reason: an adapter that re-prices before holding has to re-price the trip that was quoted.
- **`crewType` is a pricing input, not a listing attribute** (`bareboat | skipper | full-crew`). The same hull is offered bareboat or skippered at different prices, so the booking sidebar's Crew control feeds `availability.quote` / `availability.reprice`, is frozen on the quote row, and is part of the price fingerprint. An adapter that does not price crew echoes it back unchanged.
- **Quote lines carry a `group`** (`mandatory | optional | crew`) alongside `kind`. `kind` is what the pricing pipeline acts on; `group` is how the booking summary sections the line for the customer, which `kind` cannot answer — an unavoidable cleaning fee and an optional hot tub are both charges against the same yacht. Absent on the base, discounts and credit.

### 4.3 Mock provider (ships M2)

`MockInventoryProvider` reads **provider-shaped fixtures** (mirroring NauSYS/BM shapes so the same mapping code runs) for the catalogue, extras and payment plans, plus a "provider re-price on quote" path so revalidation is testable pre-credentials. Default via `PROVIDER_MODE=mock`.

**Availability is the exception: it comes from `availability_slot`, not from a fixture.** Under `PROVIDER_MODE=mock` those rows are the vendor's inventory, exactly as a real vendor's would be after a sync, and they are what `availability.calendar` publishes. Quoting from a separate fixture meant the catalogue offered weeks the quote endpoint then refused with a conflict — a slot cannot be bookable and unpriceable at once. The fixture source survives as the default for unit tests, which have no database.

### 4.4 Connector mechanics (both real providers)

- **Mapping layer** per connector: pure `raw → canonical` functions, unit-tested, the only place that knows provider field names.
- **Raw retention:** every payload persisted to `provider_raw_payload` before mapping (replay + audit). Encrypt where it contains PII/financials (§10).
- **Sync tracking:** `sync_run`/`sync_error` per execution; `sync_cursor` for incremental.
- **Errors & retries:** typed (`RateLimited`, `Transient`, `AuthError`, `NotFound`, `Contract`). Backoff+jitter for transient/rate-limited; contract/auth fail fast and alert.
- **Idempotency:** imports keyed by `unique(provider, resource_type, external_id)`; booking calls carry our generated `idempotency_key` stored on `booking`/`payment`.
- **Rate-limit safety:** per-provider token bucket; batched, resumable syncs (limits TBD, Q-RATE).

---

## 5. Public oRPC contract groups

Plain-object routers on `appRouter`, Zod v4 `.input()/.output()`, `publicProcedure` / `protectedProcedure`, plus `adminProcedure`. DTOs are canonical.

### 5.1 `charterSearch` — results, facets, map _(M3)_

- `charterSearch.results({ destination, query, checkIn, checkOut, guests, category, minCabins, maxPriceMinor, currency, sort, page, pageSize }) → { items, pagination }`; page mode is the default (`page=1`, `pageSize=10`).
- `charterSearch.results({ ..., cursor, limit }) → { items, nextCursor }` remains available for cursor-based forward browsing. When `cursor` is present, cursor mode takes precedence over default page values.
- `charterSearch.facets(filters) → { destinations, categories, amenities, priceRange }`
- `charterSearch.mapMarkers(filters) → { markers:{ listingId, slug, title, lat, lng, priceFromMinor, currency }[] }`
- `charterSearch.suggestions({ query }) → { label, kind }[]`
- Public OpenAPI paths: `GET /charter-search/results`, `GET /charter-search/facets`, `GET /charter-search/map-markers`, `GET /charter-search/suggestions`.

### 5.2 `listings` — list & detail _(M3)_

- `listings.get({ id }) → ListingDetail` (summary/specs/gallery/amenities/operator/base)
- `listings.reviews({ listingId }) → { id, rating, author, body }[]`
- `listings.similar({ listingId }) → ListingCard[]`
- Public OpenAPI paths: `GET /listings/{id}`, `GET /listings/{listingId}/reviews`, `GET /listings/{listingId}/similar`.

### 5.3 `availability` — calendar & quote _(M4)_

- `availability.calendar({ listingId, from, to }) → { listingId, slots: Slot[] }` (cache-backed)
- `availability.quote({ listingId, checkIn, checkOut, guests, extras, currency }) → Quote` — **live-revalidated**; creates a `quote` with `expires_at`, breakdown, `payment_policy`
- `availability.reprice(quoteId) → Quote`
- Public OpenAPI paths currently include `GET /listings/{listingId}/availability-calendar` and `POST /availability/quote`.

### 5.4 `wishlist` / `profile` / `referral` — account _(M2, protected)_

- `wishlist.list/add/remove`, `profile.get/update`, `referral.myCode/redeem`

### 5.5 `checkout` / `booking` — hold, confirm, payment _(M5, protected)_

- `checkout.createHold({ quoteId }) → { bookingId, holdExpiresAt }` (skipped if provider lacks options)
- `checkout.confirm({ quoteId | bookingId, paymentPreference }) → { bookingId, clientSecret, amount, kind }`
- `checkout.status(bookingId) → BookingStatus` (confirmation screen polls)
- `booking.list() / booking.get(id)` (never returns crew/passport PII — §10)

### 5.6 `admin` — internal price rules & ops _(M4, admin-only)_

- `admin.priceRule.list/create/update/deactivate`, `admin.priceRule.preview({ ruleDraft, listingId, dateRange }) → { before, after }`
- `admin.match.queue / confirm(listingSourceId, listingId) / reject`
- `admin.sync.run(provider, kind) / status(runId)`
- `admin.booking.cancel(bookingId, reason)`

### 5.7 Authorization boundaries

- `publicProcedure`: search, listing, calendar, quote (anonymous quoting allowed).
- `protectedProcedure`: wishlist, profile, referral, all `checkout`/`booking`; ties resources to `context.session.user.id`.
- **`adminProcedure`** = `protectedProcedure.use(requireAdmin)`; `requireAdmin` throws `ORPCError("FORBIDDEN")` unless `session.user.role` is staff/admin (Q-ADMIN). Every admin mutation writes `audit_log`. Never expose agency price/commission except to an explicit internal admin role.

---

## 6. Booking & payment state machine _(reconciled — fuller model)_

```
DRAFT ─► QUOTED ─► OPTION_PENDING ─► OPTION_HELD ─► PAYMENT_PENDING ─► CONFIRMING ─► CONFIRMED
   │        │            │               │                │               │
   │        │            │               │                │               └─► PROVIDER_REJECTED ─► REFUND_PENDING ─► REFUNDED
   │        │            │               │                └─► PAYMENT_FAILED (retry ↺ or ─► CANCELLED)
   │        └─ QUOTE_EXPIRED             └─ OPTION_EXPIRED
   └─ (abandoned)
CANCELLED reachable from any pre-CONFIRMED state (user/admin).
```

**`booking.status` enum:** `DRAFT`, `QUOTED`, `OPTION_PENDING`, `OPTION_HELD`, `PAYMENT_PENDING`, `CONFIRMING`, `CONFIRMED`, `QUOTE_EXPIRED`, `OPTION_EXPIRED`, `PAYMENT_FAILED`, `PROVIDER_REJECTED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`.

### 6.1 Flow

1. **QUOTED** (`availability.quote`) — immutable `quote` with `expires_at` + `price_source_hash`. Nothing reserved.
2. **OPTION_PENDING → OPTION_HELD** (`checkout.createHold`) — only if `capabilities().supportsOptions`. Creates `booking` + provider option with `hold_expires_at`. Mock supports options, so the path is demoed.
3. **PAYMENT_PENDING** (`checkout.confirm`):
   - **Re-validate:** past `expires_at` → `QUOTE_EXPIRED`, force `reprice`. Re-fetch live price; if it differs from `price_source_hash` → `PRICE_CHANGED` error + new quote (no silent change).
   - Amount from `quote.payment_policy` (deposit % or full). Create Stripe **PaymentIntent** (test mode) with our `idempotency_key`; write `payment_schedule` + `payment(requires_payment)`. Return `clientSecret`.
4. **CONFIRMING → CONFIRMED** via **Stripe webhook** (authoritative):
   - `payment_intent.succeeded` → `payment.succeeded`, enter **CONFIRMING**, call `confirmBooking` (or promote the option). Success → `CONFIRMED`, capture `provider_reservation_id`. Provider failure → `PROVIDER_REJECTED` → **REFUND_PENDING** → refund/void (test mode) → **REFUNDED**, surfaced to ops.
   - `payment_intent.payment_failed` → `PAYMENT_FAILED`; retry until quote/hold expiry, else `CANCELLED`.
5. **Expiry sweeper** (cron/worker): quotes past `expires_at` → `QUOTE_EXPIRED`; holds past `hold_expires_at` → release provider option → `OPTION_EXPIRED`.

### 6.2 Correctness properties

- **Idempotency:** unique `idempotency_key` on `booking` and `payment`; unique Stripe event id on `provider_webhook_event` → exactly-once processing. Stripe calls pass `Idempotency-Key`.
- **Race prevention:** quote→confirm takes a row lock (`SELECT … FOR UPDATE`); a unique constraint prevents two `CONFIRMED` bookings for the same provider option; **do not create two provider options for one user action.** Provider is the final arbiter — `confirmBooking` is the authoritative commit; we reconcile to its response.
- **Quote expiration & price revalidation:** every state-advancing call revalidates `expires_at` + `price_source_hash`; changed price can't pass silently.
- **Stripe ↔ provider ordering:** money before provider commit **only when the provider guarantees the option/hold** (`optionExpiryOwnedByProvider`); otherwise hold first, then charge — driven by `capabilities()` (Q-AVAIL, D-PAYORDER). Mock guarantees the hold, so the demo charges then confirms and exercises the provider-rejected → auto-refund branch.

### 6.3 Payment policy is explicit & configurable — **not a hardcoded 50/100**

- `payment_policy` resolves per **quote**: explicit `listing.payment_policy` override → provider payment plan (NauSYS returns plans) → marketplace default. Shape `{ mode, deposit_pct, balance_due_at, currency }`.
- Demo supports **50% deposit** and **100% prepayment** as two configured policies; code reads the policy, never hardcodes 50. Balance capture (a second PaymentIntent at `balance_due_at`, tracked in `payment_schedule`) is scaffolded now, automated later.

---

## 7. Phased implementation plan (Daria)

Gates: **`pnpm check-types`** + **`pnpm build`** (non-mutating). Run `pnpm check` deliberately (rewrites formatting). Vitest for the risky core (D-TEST).

### M2 — Schema, contracts, mock fixtures

1. `packages/db`: schema per §1 (canonical, generic provenance `provider_record`+`listing_source`, account, admin/audit). Conventions in Appendix A. Re-export each file in `schema/index.ts`. `pnpm db:push`.
2. Shared primitives: `id(prefix)` helper, `timestamps` mixin, `money` (amount-minor + currency) + exact-decimal percentage helper, `pgEnum` set.
3. `packages/providers`: `InventoryProvider` interface, canonical Zod DTOs, `MockInventoryProvider` + fixtures + mapping skeleton, `sync_run`/`provider_raw_payload` plumbing.
4. `packages/api`: read contracts (`charterSearch`/`listings`/`availability`/`wishlist`/`profile`/`referral`) returning mock-backed canonical DTOs; add `adminProcedure`. Register on `appRouter`.
5. Seed: mock → canonical.

- **Acceptance:** gates green; frontend calls every read contract via `AppRouterClient`; **no provider shapes leak**; `PROVIDER_MODE` swaps adapter only.

### M3 — Search & availability query endpoints

`listing_search_doc` + `availability_slot` read models (code-managed rebuild after sync) → `charterSearch.results/facets/mapMarkers/suggestions` + `availability.calendar` (trigram/ILIKE + btree/GiST geo; **[ASSUMPTION]** no PostGIS for demo). Facets are dynamic from `listing_search_doc` for M3; `facet_dictionary` is deferred until stable labels/i18n are needed.

- **Acceptance:** results/filters/sort/pins/calendar from real queries on mock data; stable cursor pagination; direct page pagination with total counts for the Figma UI; p95 ≤ **[ASSUMPTION]** 200ms local.

### M4 — Availability & pricing query layer

**Core (in scope):** pricing pipeline (provider `clientPrice` → `price_adjustment_rule` → `discount`/referral → `payment_policy` → `quote`+`quote_line`+`price_adjustment_snapshot`); `availability.quote`/`reprice`. The `price_adjustment_rule`/`price_adjustment_target` **tables + pipeline hook + `audit_log`** ship now so quotes already honor internal overrides and the feature is a drop-in.
**Flexible tail (see D-MPRICE-SCOPE):** the staff-facing `admin.priceRule.*` **CRUD + `preview` UI**. The team-lead sprint board lists "Manage Prices" as deferred/flexible-tail for the 1-Sep demo; the client confirms it's an **internal** tool (not owner-facing — the board conflated it with the owner role). So the _engine_ is M4; the _admin UI_ is post-core unless product pulls it in.

- **Acceptance (core):** a quote reflects correct provider price + an internal adjustment applied via a seeded rule (single & group) + promo/referral + right policy; expired quotes reprice; all audited. (Admin CRUD UI acceptance applies only if the tail is pulled in.)
- **Decisions:** D-RULES (stacking/priority, travel vs booking date), referral mechanics, **D-MPRICE-SCOPE** (is the Manage-Price admin UI in the demo?).

### M5 — Booking state machine + Stripe test

`booking`/`payment_schedule`/`payment`/`provider_reservation_event`/`provider_webhook_event`/`booking_traveller` schema + §6 machine (row-lock, idempotency, CONFIRMING + refund states). Stripe test PaymentIntents (deposit/full); `checkout.createHold/confirm/status`; Stripe webhook on Hono (`/api/stripe/webhook`, signature-verified, deduped, mounted before RPC dispatch). Mock `createOption/confirmBooking/cancelOption` + provider-rejected(auto-refund) + expiry sweeper. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

- **Acceptance:** e2e quote → (hold) → deposit **and** full → webhook → provider confirm → `CONFIRMED`; confirmation polls `checkout.status`. Failure branches behave (declined → `PAYMENT_FAILED`; provider reject → `REFUND_PENDING`→`REFUNDED`; expired → `PRICE_CHANGED`/`QUOTE_EXPIRED`; dup webhook → single effect; retried confirm → no double booking).
- **Decision:** D-PAYORDER (tied to Q-AVAIL).

### M6 — Observability

Sentry (server+web) with `booking_id`/`sync_run_id` context; extend `evlog` wide-events with domain fields; funnel analytics (search→quote→book); alerts (sync failures, webhook lag, provider error rate, conversion). **No PII/card data in logs** (§10).

- **Acceptance:** forced provider error + forced webhook failure surface in Sentry with correlation ids; funnel events emitted.

### later

BM + NauSYS adapters (same interface; NauSYS via [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md)); Stripe live; operator/owner roles (auth plugin); CMS/translations (dictionaries already externalised); crew-list push from `booking_traveller`/`provider_contact`.

---

## 8. Decisions, risks & vendor questions

### Decided _(2026-07)_

- ✅ **D-MONEY** — integer **minor units** + per-value ISO `currency` for amounts; **percentages as exact decimals**. 2 decimals preserved as the integer's last digits; `Money` helper formats per currency exponent. Stripe-native, no float.
- ✅ **D-ID** — `text` PK + prefixed `id(prefix)` helper (`ylst_`, `bkg_`, `qte_`…). Matches auth tables; app-side generation for idempotency.
- ✅ **Q-ADMIN** — `role` column on `user` (via `packages/auth` + `db:push`); Better Auth admin plugin deferred.
- ✅ **D-TEST** — Vitest for mapping / pricing / state-machine units; `test` task in `turbo.json`.
- ✅ **Vocabulary & modeling reconciliation** — reconciled canonical names; generic `provider_record` + `listing_source`; fuller state machine (+`CONFIRMING`/refunds); `payment_schedule`; PII controls + MVP exclusions (§10).
- ✅ **Q-NAU (was open)** — NauSYS field/endpoint mapping now captured in [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md).

### Open — needed by their milestone

- ⬜ **D-RULES** _(M4)_ price-rule stacking & priority; travel-date vs booking-date windows.
- ⬜ **Referral/discount mechanics** _(M4)_ who gets what, when it applies. _(Sprint board: "Referrals + discounts UI on the rules engine" is M5 — the backend rules engine must be ready in M4 to feed that UI.)_
- ⬜ **D-MPRICE-SCOPE** _(M4)_ is the internal **Manage-Price admin UI** in the 1-Sep demo, or flexible-tail? Engine/data-model ships regardless; only the staff CRUD/preview UI is in question. Client wants the capability (internal, not owner-facing); board defers it. Confirm with team lead.
- ⬜ **D-PAYORDER** _(M5)_ deposit % default(s) and charge-vs-hold ordering (tied to Q-AVAIL).

### Vendor questions (both providers unless noted)

- **Q-PERM** agency credential permissions (which endpoints create options/bookings, add extras, access invoices, manage contacts?).
- **Q-RATE** rate limits, pagination, bulk catalogue capability, timeouts, retry guidance, sync cadence/duration.
- **Q-AVAIL** availability/quote **guarantees** — is a price/slot firm for N minutes? real option/hold + TTL? (drives §6.2 ordering).
- **Q-OPT** option expiry + cancellation semantics (auto-expiry, windows, penalties, who cancels; whether an option locks price+availability).
- **Q-PRICE** _(partly answered)_ NauSYS returns `priceListPrice`/`agencyPrice`/`clientPrice` + `securityDeposit`/`depositWhenInsured`/`paymentPlans`/`obligatoryExtras`/`agencyCommission`/`displayCurrency`. **Still confirm:** exact commission/VAT semantics, currency-conversion responsibility, allowed agency discount limits, and BM's equivalent price fields (validate vs Swagger v2.1.4).
- **Q-HOOK** do providers offer **webhooks** for price/availability/option/cancellation changes, or poll-only?
- **Q-DUP** stable cross-provider IDs (MMSI/IMO/company codes) for safe matching; default transacting source when in both (§3.5)?
- **Q-MEDIA** _(partly answered)_ BM states data may be displayed "on your website as you wish" (implies caching/display rights during the licensed period) — confirm in the BM **T&C** whether Cloudinary caching/transforming is permitted, and get the equivalent for NauSYS.
- **Q-COMPLY** customer/crew PII handling, retention, GDPR/data-processing terms, invoice ownership.
- ✅ **Q-PAGES** _(closed)_ NauSYS PDF confirmed complete at 358 pages; map built from the full document.
- **Q-ACCESS** _(new)_ both providers gate API access behind commercial terms — BM needs a **commercial proposal + online T&C** before keys; **schedule the trial start** so the 1-month BM free window overlaps the connector build (not wasted during mock-only M2–M3). NauSYS agency terms similarly TBD.

---

## 9. Appendix — screen → backend fields (provider-driven; validate against Figma annotations)

> Figma annotation text wasn't machine-extractable (§0); validate against the designers' cards.

| Screen                            | Entities                                                                                                    | Notable fields                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Home / hero search                | `facet_dictionary`, geography, `listing_search_doc`                                                         | destination suggest, dates, guests, yacht type; trending media                                                                             |
| Results + filters + sort          | `listing_search_doc`, `availability_slot`, `facet_dictionary`                                               | card media/name/model/length/cabins/base/price-hint/rating; filters: category, cabins, length band, price band, amenity, base/region; sort |
| Map + pins                        | `listing_search_doc`(geo)                                                                                   | lat/lng, price hint, clustering, bbox                                                                                                      |
| Trip-builder wizard               | `availability`, `quote`                                                                                     | destination→dates→guests→extras→review; valid weekdays/min nights                                                                          |
| Yacht detail                      | `listing`, `listing_specification`, `listing_media`, `listing_amenity`, `review`, `faq`, `operator`, `base` | specs, ordered gallery, amenities (obligatory/optional + price), operator, base, reviews summary, FAQ                                      |
| Availability calendar             | `availability_slot`                                                                                         | week slots, status, min nights, check-in/out weekdays                                                                                      |
| Booking card (deposit/full)       | `quote`, `payment_policy`                                                                                   | breakdown, deposit-vs-full toggle, total, currency, expiry                                                                                 |
| Checkout / summary / confirmation | `booking`, `payment_schedule`, `payment`, `booking_traveller`                                               | booking status, payment status/clientSecret, lead guest + crew, confirmation ref                                                           |
| Login / registration / profile    | `user`/`session`, `profile`                                                                                 | auth flows; phone, locale, currency, marketing prefs                                                                                       |
| Wishlist                          | `wishlist`, `wishlist_item`                                                                                 | saved listings                                                                                                                             |
| Referrals / discounts             | `referral`, `discount`/`promo_code`                                                                         | referral code, redemption state, promo validation at quote                                                                                 |
| Internal price management (staff) | `price_adjustment_rule`, `price_adjustment_target`, `audit_log`                                             | rule type/value, targets, date window, before/after preview                                                                                |

---

## 10. Data protection & MVP exclusions

**Sensitive data (crew/passenger/contact).** `booking_traveller`, `provider_contact`, and any `provider_raw_payload` containing PII or operator financials: **encrypt at rest**, **minimize retention**, **redact in application logs**, and **never return in generic profile/booking-list procedures** — only in a dedicated, access-controlled, audited crew/manifest procedure. Collect crew data only after booking, when the provider requires it. This satisfies Q-COMPLY groundwork.

**Deliberate MVP exclusions** (preserve raw records so they remain possible later): cabin charter, warehouse transfers, maintenance, operator/owner user administration, legacy NauSYS Contacts endpoints (use Contacts2), provider online-payment handling (Stripe is our payment path for the demo), and **owner accounts**. Don't add public tables or oRPC procedures for these until product scope changes.

---

## Appendix A — repo conventions to honor

- **IDs:** `text("id").primaryKey()` + shared `id(prefix)` helper (`$defaultFn(() => `${prefix}_${nanoid()}`)`). No `uuid`/`serial`.
- **Timestamps:** `timestamp("created_at").defaultNow().notNull()`; updated via `.$onUpdate(() => new Date())`. Normalize event timestamps to UTC.
- **Columns:** snake_case in DB, camelCase in TS.
- **Money:** amounts = integer **minor units** (`integer`/`bigint`) + sibling `currency` text; **percentages = exact `numeric` decimals**; never `float`.
- **Indexes:** third `pgTable` arg is an **array** — `(table) => [index("x_idx").on(table.col)]`.
- **Relations:** separate `relations()` exports; **every new schema file must be re-exported from `packages/db/src/schema/index.ts`**.
- **Enums:** `pgEnum` for closed sets (statuses, rule types, resource types); externalise user-facing labels to `facet_dictionary` for i18n.
- **JSON:** `jsonb` for breakdowns, raw payloads, match signals, payment policy, commercial snapshots.
- **Validation:** **Zod v4** (`z.url()` top-level), via `@orpc/zod/zod4`; `.input()/.output()` on every procedure.
- **oRPC:** plain-object procedures on `appRouter`; nested objects for sub-routers; `new ORPCError("CODE")`; extend request-scoped values in `packages/api/src/context.ts`.
- **Server:** Hono handler order is load-bearing (evlog → identifyUser → CORS → auth mount → RPC/OpenAPI dispatch). New routes (Stripe webhook) mount beside the auth handler, before the RPC catch-all. Port 3000 hardcoded.
- **Env:** add server vars to `packages/env/src/server.ts` (Zod) + `apps/server/.env.example`; never read `process.env` directly in app code.
- **Migrations:** dev uses `db:push` (no `src/migrations/` yet); generate migrations only when moving toward staging/live.
- **Provider boundary:** never use a provider numeric ID as a public identifier; keep it in `provider_record.external_id`. Provider endpoint URLs, credentials, commission, agency cost, and raw errors never reach the web client.
