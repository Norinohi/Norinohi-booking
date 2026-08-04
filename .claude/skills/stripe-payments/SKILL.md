---
name: stripe-payments
description: Conventions for Stripe test-mode payments and the booking state machine (M5) in the yacht-charter marketplace. Use when implementing PaymentIntents, the Stripe webhook, payment_schedule/payment tables, deposit vs full policy, or the quote→confirm flow. TRIGGER when the task mentions Stripe, payments, deposit/prepayment, checkout confirm, webhooks, or the reservation/booking state machine.
---

# Stripe payments & booking state machine (yacht-charter)

Authoritative model: `docs/backend-architecture.md` §6 (state machine) + §10 (PII). Milestone M5, **test mode only** (live mode is post-demo).

> **Scope split — read this first.** For _generic_ Stripe decisions — API choice (we use **PaymentIntents**, not Checkout), API-key/restricted-key handling, webhook signature verification, Tax/Connect, SDK version/migrations — use the vendored **`stripe-best-practices`** skill. This skill is **only** the yacht-charter-specific booking integration layered on top of it. Where they meet (webhooks, idempotency), the official skill has the Stripe mechanics; the rules below add _our_ ordering and state transitions.

## Money & policy

- All Stripe amounts are **integer minor units + currency** — the same representation the DB uses (D-MONEY). No conversion, no floats.
- **Payment policy is per-quote and configurable — never hardcode 50%.** Resolve in order: explicit `listing.payment_policy` → provider payment plan → marketplace default. Shape `{ mode: 'deposit'|'full', deposit_pct, balance_due_at, currency }`. Demo supports 50% deposit AND 100% prepayment as two configured policies.
- `payment_schedule` rows model installments (`deposit`/`balance`/`full`); `payment` mirrors each Stripe PaymentIntent.

## The flow (authoritative sequence)

1. `checkout.confirm` re-validates the quote: past `expires_at` → `QUOTE_EXPIRED` + reprice; live price differs from `price_source_hash` → throw `ORPCError("PRICE_CHANGED")` with the new quote (**no silent price change**).
2. Create a Stripe **PaymentIntent** (test) with our `idempotency_key` (pass Stripe's `Idempotency-Key` header too). Write `payment(requires_payment)`; set `booking.status = PAYMENT_PENDING`. Return `clientSecret`.
3. **The Stripe webhook is authoritative — not the client.** Route: `app.on("POST", "/api/stripe/webhook", ...)` mounted **beside the auth handler, before the RPC dispatch catch-all**. Verify the signature (`STRIPE_WEBHOOK_SECRET`); dedupe by event id into `provider_webhook_event` (exactly-once).
4. On `payment_intent.succeeded` → `payment.succeeded`, enter **CONFIRMING**, call `provider.confirmBooking` (or promote the option). Success → **CONFIRMED** (capture `provider_reservation_id`). Provider failure → **PROVIDER_REJECTED** → **REFUND_PENDING** → refund/void → **REFUNDED**, surfaced to ops.
5. On `payment_intent.payment_failed` → **PAYMENT_FAILED** (retry until quote/hold expiry, else **CANCELLED**).

## Correctness (do not skip)

- **Stripe success ≠ booking confirmation.** Confirm only after the provider commit succeeds.
- **Idempotency:** unique `idempotency_key` on `booking` and `payment`; unique Stripe event id on `provider_webhook_event`.
- **Race prevention:** row-lock the booking during confirm (`SELECT … FOR UPDATE`); a unique constraint prevents two `CONFIRMED` bookings for one provider option; never create two provider options for one user action.
- **Charge ordering** (D-PAYORDER) is driven by `capabilities().optionExpiryOwnedByProvider`: guaranteed hold → charge then confirm; otherwise hold first. Mock guarantees the hold, so the demo charges-then-confirms and exercises the auto-refund branch.

## PII

Never log card data (Stripe holds PANs; we store only intent ids). Keep `booking_traveller`/crew data out of generic procedures and logs (§10).

## Env & gates

Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to `packages/env/src/server.ts` (Zod) + `apps/server/.env.example`. Gates: `pnpm check-types` + `pnpm build`; Vitest for the state-machine transitions. Local webhook forwarding goes to our route: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (general Stripe-CLI usage → `stripe-best-practices`).
