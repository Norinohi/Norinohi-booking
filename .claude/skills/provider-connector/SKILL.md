---
name: provider-connector
description: Conventions for building inventory-provider connectors (mock, Booking Manager, NauSYS) in packages/providers for the yacht-charter marketplace. Use when implementing the InventoryProvider interface, mapping raw provider payloads to canonical DTOs, fixtures, sync, retries, or idempotency. TRIGGER when editing packages/providers or when the task mentions a provider adapter, catalogue sync, availability search, quote, option, or booking against NauSYS/Booking Manager.
---

# Provider connector conventions (yacht-charter)

Authoritative model: `docs/backend-architecture.md` §3 (duplicates), §4 (abstraction), §6 (state machine). NauSYS specifics: `docs/nausys-api-v6-backend-map.md`. Booking Manager: Swagger `mmksystems/bm-api` v2.1.4.

## The prime directive
**Provider payload shapes and provider IDs never leave `packages/providers`.** Every method returns a **canonical DTO** validated with Zod v4. A malformed provider payload must fail here, not in the web app.

## The interface — `packages/providers/src/provider.ts`
```ts
export interface InventoryProvider {
  readonly key: "mock" | "booking_manager" | "nausys";
  syncCatalogue(cursor?: string): AsyncIterable<RawEntity>;          // writes provider_record + provider_raw_payload + sync_run
  searchAvailability(input: AvailabilitySearch): Promise<AvailableOffer[]>;
  getAvailability(input: ListingPeriod): Promise<AvailabilityCalendar>;
  getQuote(input: QuoteRequest): Promise<ProviderQuote>;
  createOption(input: BookingDraft): Promise<ProviderReservation>;   // may throw NotSupported
  confirmBooking(input: ConfirmBooking): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
  cancelOption(ref: ProviderReservationRef): Promise<void>;
  capabilities(): ProviderCapabilities; // { supportsOptions, supportsWebhooks, optionExpiryOwnedByProvider, minHoldMinutes }
}
```
Canonical DTOs live in `packages/providers/src/types.ts` as Zod v4 schemas + inferred types: `AvailabilitySearch`, `AvailableOffer`, `AvailabilityCalendar`, `QuoteRequest`, `ProviderQuote`, `BookingDraft`, `ProviderReservation`, `ProviderCapabilities`.

## Rules
1. **Mock first.** `MockInventoryProvider` (fixtures under `mock/fixtures/*.json` that mirror real NauSYS/BM shapes) ships in M2 and is the default (`PROVIDER_MODE=mock`). It must exercise the same mapping code as the real adapters.
2. **Mapping layer is pure.** `mapping/` holds `raw → canonical` functions only — the single place that knows provider field names. Unit-test them (Vitest).
3. **Retain raw before mapping.** Persist every fetched payload to `provider_raw_payload`; link from `provider_record`. Encrypt payloads containing PII/financials.
4. **Provenance is generic.** One `provider_record` per resource, unique `(provider, resource_type, external_id)` — this is the import idempotency key. Canonical↔provider yacht links go in `listing_source` with match fields; never auto-merge (see §3).
5. **Sync tracking.** Every run writes `sync_run`/`sync_error` (counts, status, sanitized error); use `sync_cursor` for incremental (`updatedSince`/page token).
6. **Typed errors + retry.** `RateLimited`/`Transient` → backoff + jitter; `AuthError`/`Contract` → fail fast + alert. Per-provider token-bucket limiter.
7. **Idempotency on bookings.** We generate an `idempotency_key`, store it on `booking`/`payment`; a retried create must never double-book.
8. **Capabilities drive the flow.** The booking state machine reads `capabilities()` — no `createOption` → skip hold; `optionExpiryOwnedByProvider=false` → don't promise a hold.
9. **Price/availability reconciled live at quote**, never merged across providers. A selected offer has exactly one provider source.
10. **NauSYS price fields:** `clientPrice` = customer pays, `agencyPrice` = our cost, `priceListPrice` = list. Also `securityDeposit`, `depositWhenInsured`, `paymentPlans`, `obligatoryExtras`, `oneWayPeriods`, `minimumShortPeriodDuration`, status `FREE`/`UNDER_OPTION`.

## Gates
`pnpm check-types` + `pnpm build`; `pnpm --filter providers test` (Vitest for mappers). Never leak provider types across the package boundary — the public export surface is DTOs + the interface only.
