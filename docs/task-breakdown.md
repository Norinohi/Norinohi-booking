# Task Breakdown & Tooling — Yacht-Charter Backend

Companion to [`backend-architecture.md`](./backend-architecture.md) (canonical shared model), [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md) (NauSYS connector reference), and [`open-questions-and-decisions.md`](./open-questions-and-decisions.md) (open decisions, vendor questions, assumptions). M2 is broken into atomic, assignable tasks; M3–M6 are task groups. §Tooling recommends the skills and agents (existing-in-repo vs new) to lean on for each phase.

**Conventions:** all IDs `text` + prefixed helper, amounts in integer minor units + currency (percentages as exact decimals), Zod v4 contracts, plain-object oRPC routers, `pgEnum` for closed sets, every schema file re-exported from `packages/db/src/schema/index.ts`. Reconciled vocabulary: `provider_record`+`listing_source`, `operator`, `amenity`, `booking`, `price_adjustment_rule`. Gates: `pnpm check-types` + `pnpm build` (non-mutating); `pnpm check` only deliberately (rewrites formatting). See Appendix A of the architecture doc.

Status legend: ☐ todo · ◐ in progress · ☑ done · 🔒 blocked. Each task: **deps**, **acceptance**, **skill/agent**.

---

## M2 — Schema, contracts, mock fixtures

### M2-0 · Confirm cross-cutting decisions ☑ done (2026-07)

- **D-MONEY** → integer **minor units** + ISO `currency` (2 decimals = last integer digits; `Money` helper formats per currency exponent).
- **D-ID** → `text` PK + prefixed `id(prefix)` helper (`ylst_`, `bkg_`, `qte_`…).
- **Q-ADMIN** → `role` column on `user` (via `packages/auth` + `db:push`); admin plugin deferred.
- **D-TEST** → **Vitest** for the risky core (mapping, pricing math, state machine); `test` task in `turbo.json`.
- **Recorded in:** architecture doc §8. Unblocks M2-1..M2-14.

### M2-1 · Shared DB primitives

`packages/db/src/schema/_shared.ts`: `id(prefix)` helper (`text().primaryKey().$defaultFn`), `timestamps` mixin (`created_at`/`updated_at`), `money` helper (amount-minor `integer`/`bigint` + `currency` text), and the project's `pgEnum` set (statuses, rule types, match status, provider keys).

- **deps:** M2-0 · **acceptance:** helpers imported by at least one table; `check-types` green · **skill:** — (internal convention) · **agent:** _drizzle-schema-author_ (new)

### M2-2 · Provider & provenance schema _(generic model)_

Tables: `provider`, `provider_raw_payload`, `provider_record` (generic: `resource_type`+`external_id`), `sync_run`/`sync_error`, `listing_source` (canonical↔provider link, match fields), `listing_duplicate_candidate` (review queue). `unique(provider, resource_type, external_id)` on `provider_record`.

- **deps:** M2-1 · **acceptance:** `db:push` applies; FK/unique constraints present; visible in `db:studio` · **agent:** _drizzle-schema-author_

### M2-3 · Canonical marketplace schema

`listing`, `listing_specification`, `listing_media`, `listing_checkin_rule`, `listing_one_way_rule`, `builder`, `yacht_model`, `yacht_category`, `amenity`, `amenity_category`, `listing_amenity`, `country`, `region`, `location`, `base`, `operator`, `review`, `faq`. Relations + geo lat/lng on `base`. `listing.primary_source_id`, `slug` unique.

- **deps:** M2-2 · **acceptance:** `db:push` clean; relations resolve in a sample query; barrel updated · **agent:** _drizzle-schema-author_

### M2-4 · Account schema

`profile` (1:1 `user`), `wishlist` + `wishlist_item`, `referral` + `referral_redemption`. FK to Better-Auth `user` with `onDelete: cascade`.

- **deps:** M2-1 · **acceptance:** `db:push` clean; does not touch `auth.ts` · **skill:** `better-auth-best-practices` (repo) · **agent:** _drizzle-schema-author_

### M2-5 · Admin/audit stub

`audit_log`; add `role` column on `user` (Q-ADMIN = column, via `packages/auth` + `db:push`). `price_adjustment_rule`/`price_adjustment_target` **table shells** now, logic in M4.

- **deps:** M2-0, M2-1 · **acceptance:** `db:push` clean · **skill:** `better-auth-best-practices` (repo)

### M2-6 · Barrel + push + verify

Re-export every new file in `schema/index.ts`; `pnpm db:push`; eyeball in `db:studio`.

- **deps:** M2-2..M2-5 · **acceptance:** all tables present; `check-types`/`build` green · **skill:** `turborepo` (repo)

### M2-7 · `packages/providers` scaffold

New workspace: `package.json` (`drizzle-orm@0.45.2` not needed here; depends on `zod` catalog + `@yacht-charter/db` types), tsconfig extending `packages/config/tsconfig.base.json`, `InventoryProvider` interface, canonical Zod v4 DTOs in `types.ts` (`AvailabilitySearch`, `AvailableOffer`, `AvailabilityCalendar`, `QuoteRequest/ProviderQuote`, `BookingDraft/ProviderReservation`, `ProviderCapabilities`).

- **deps:** M2-0 · **acceptance:** package builds; DTOs export; `check-types` green · **skill:** `turborepo` (repo) · **agent:** _provider-adapter-author_ (new)

### M2-8 · Provider-shaped fixtures + mapping skeleton

`mock/fixtures/*.json` mirroring NauSYS/BM response shapes (companies, bases, models, yachts, amenities, media, seasons, availability grids, prices, extras, payment plans). `mapping/` pure functions `raw→canonical`.

- **deps:** M2-7 · **acceptance:** mapping fns typed to canonical DTOs; deterministic; sample raw→canonical round-trips · **agent:** _provider-adapter-author_

### M2-9 · MockInventoryProvider implementation

Implements `InventoryProvider`: `syncCatalogue` (yields raw + writes `provider_raw_payload`/`provider_record`/`sync_run`), `searchAvailability`, `getAvailability`, `getQuote` (incl. a re-price path), `createOption`/`confirmBooking`/`cancelOption`/`addOrUpdateExtras`, `capabilities()={supportsOptions:true, supportsWebhooks:false, optionExpiryOwnedByProvider:true,…}`. Simulates valid check-in/out weekdays, min duration, occupied/option windows, deposit vs full policies.

- **deps:** M2-8 · **acceptance:** each method returns valid canonical DTOs; `PROVIDER_MODE=mock` default · **agent:** _provider-adapter-author_

### M2-10 · Seed script (mock → canonical)

Run mock `syncCatalogue` → populate canonical `listing`/taxonomy/media/`availability_slot` + `provider_record`/`listing_source`. Enough rows for realistic results/map/calendar.

- **deps:** M2-3, M2-9 · **acceptance:** `pnpm --filter db seed` (or similar) fills DB; results/map/calendar have data · **skill:** `turborepo` (repo)

### M2-11 · oRPC contract stubs (read side)

`adminProcedure` middleware (`requireAdmin` → `ORPCError("FORBIDDEN")`). Procedures with Zod `.input()/.output()` returning mock-backed canonical DTOs: `charterSearch.results/facets/mapMarkers/suggestions`, `listings.get/reviews/similar`, `availability.calendar/quote`, `wishlist.*`, `profile.*`, `referral.*`. Register on `appRouter`.

- **deps:** M2-9, M2-10 · **acceptance:** every procedure callable via `AppRouterClient`; no provider shapes leak; `/api-reference` OpenAPI renders · **skill:** `hono` (repo) · **agent:** _orpc-contract-author_ (new)

### M2-12 · Env & config wiring

Add `PROVIDER_MODE` (enum `mock|booking_manager|nausys`, default `mock`) to `packages/env/src/server.ts` + `apps/server/.env.example`. Provider registry reads it.

- **deps:** M2-7 · **acceptance:** bad value fails validation; default = mock · **skill:** — (repo convention)

### M2-13 · Test harness (if D-TEST = yes)

Add Vitest to `packages/providers` (+ later `packages/api`); first tests: a mapping fn and a `quote` breakdown.

- **deps:** M2-0 (D-TEST) · **acceptance:** `pnpm --filter providers test` green in CI-less run · **skill:** `regression-testing`, `playwright-skill` (global; Vitest patterns)

### M2-14 · Frontend handshake + gate

Confirm `check-types` + `build` green; share `AppRouterClient` usage with frontend; walk one screen (results) end-to-end against mock.

- **deps:** M2-11 · **acceptance:** a frontend dev renders results from the live contract · **skill:** `requesting-code-review` (global)

---

## M3 — Search & availability query endpoints

- ☑ `listing_search_doc` read model backed by committed Drizzle migrations, seeded mock data, and code-managed rebuild helpers.
- ☑ Incremental read-model rebuild path for sync workers: call `resolveListingIdsForListingSources(...)`, then `rebuildListingSearchDocsForListings(...)` after source/listing/spec/media/amenity/availability/review upserts.
- ☑ `charterSearch.results/facets/mapMarkers/suggestions` against read models (`GET /charter-search/results`, `/facets`, `/map-markers`, `/suggestions`).
- ☑ `availability.calendar` from `availability_slot` cache (`GET /listings/{listingId}/availability-calendar`).
- ☑ Stable cursor pagination for recommended/rating/newest/price sorts, including nullable price/year values.
- ☑ Direct page pagination for the Figma results pager (`page`, `pageSize`, `pagination.totalItems`, `startItem`, `endItem`, `totalPages`).
- ☐ Dedicated `facet_dictionary` table for stable translated labels. Deferred until frontend/admin needs label ownership beyond dynamic facets.
- ☐ Perf pass against production-scale import volume; local seed is too small for meaningful p95 measurement.
- **Docs testing:** run `pnpm db:start && pnpm db:migrate && pnpm db:seed && pnpm dev:server`, then open `/api-reference`.
- **skill:** `hono`, `turborepo` (repo) · **agent:** _orpc-contract-author_, `Explore` (built-in) for query hotspots

## M4 — Availability & pricing query layer

- ☐ **(core)** Pricing pipeline: provider `clientPrice` → `price_adjustment_rule` → `discount`/referral → `payment_policy` → `quote`+`quote_line`+`price_adjustment_snapshot`
- ☐ **(core)** `availability.quote`/`reprice` (expires_at, price_source_hash, breakdown)
- ☐ **(core)** `price_adjustment_rule`/`price_adjustment_target` tables + pipeline hook + `audit_log` (so quotes honor internal overrides via seeded rules)
- ☐ **(flexible tail)** `admin.priceRule.*` CRUD + `preview(before/after)` UI — sprint board defers "Manage Prices"; ship only if D-MPRICE-SCOPE pulls it in
- **decisions:** D-RULES (stacking/priority, travel vs booking date), referral mechanics, **D-MPRICE-SCOPE** (Manage-Price admin UI in demo?)
- **skill:** `better-auth-best-practices` (admin authz), `hono` (repo) · **agent:** _pricing-engine-author_ (new) or _orpc-contract-author_

## M5 — Booking state machine + Stripe test

- ☐ `booking`/`payment_schedule`/`payment`/`provider_reservation_event`/`provider_webhook_event`/`booking_traveller` schema + state-machine service (row-lock, idempotency keys, `CONFIRMING` + refund states)
- ☐ Stripe test-mode PaymentIntents (deposit + full); `checkout.createHold/confirm/status`
- ☐ Stripe webhook route on Hono (`/api/stripe/webhook`, signature-verified, deduped) — mounts beside auth handler, before RPC catch-all
- ☐ Mock `createOption/confirmBooking/cancelOption` wired to success + `PROVIDER_REJECTED`→`REFUND_PENDING`→`REFUNDED` + expiry sweeper
- ☐ `booking_traveller` PII controls (encrypt at rest, redact logs, not in generic procedures — arch §10)
- ☐ Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **decision:** D-PAYORDER (tied to Q-AVAIL) · **skill:** `hono` (repo), **new** `stripe-payments` skill · **agent:** _payments-statemachine-author_ (new)

## M6 — Observability

- ☐ Sentry (server + web) with `reservation_id`/`sync_run_id` correlation
- ☐ Extend `evlog` wide-events with domain fields; funnel analytics (search→quote→book)
- ☐ Alerts: sync failures, webhook lag, provider error rate, conversion
- **skill:** `analyze-logs`, `review-logging-patterns` (repo) · **agent:** `general-purpose`

---

## Tooling — skills & agents

### Skills already in the repo (`.claude/skills/`, hash-locked — use, don't edit)

| Skill                                         | Use it for                                                             | Phase  |
| --------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `hono`                                        | server routes, middleware order, Stripe webhook route, request testing | M2, M5 |
| `better-auth-best-practices`                  | admin/staff role, protected boundaries, not breaking `auth.ts`         | M2, M4 |
| `turborepo`                                   | new `packages/providers` wiring, task pipelines, `--filter` runs       | M2+    |
| `analyze-logs`                                | reading `.evlog` wide events while debugging                           | M2+    |
| `review-logging-patterns`                     | evlog adoption for domain events                                       | M6     |
| `shadcn`, `vercel-*`, `web-design-guidelines` | frontend team's binding work (not Daria's core, but shared)            | all    |

### Skills available globally (no vendoring needed)

| Skill                                     | Use it for                                        |
| ----------------------------------------- | ------------------------------------------------- |
| `requesting-code-review` / `/code-review` | pre-merge review of each milestone slice          |
| `regression-testing` + `playwright-skill` | test strategy + Vitest/API test patterns (D-TEST) |
| `clean-code`                              | mapping-layer & service readability passes        |
| `next-best-practices`                     | hand-offs to the frontend team                    |
| `anthropic-skills:skill-creator`          | authoring the new skills below                    |

### New skills worth creating (via `skill-creator`, then vendor under `.claude/skills/`)

| New skill                                 | Why it pays off                                                                                                                                                                   | Priority         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **`drizzle-conventions`** (repo-specific) | Encodes our exact idioms — text PKs + `id()` helper, minor-unit money, `pgEnum`, `(table)=>[index()]`, mandatory barrel re-export — so schema tasks are consistent and agent-safe | high (M2)        |
| **`orpc-contract`** (repo-specific)       | Zod v4 `.input()/.output()`, plain-object router, `adminProcedure`, no-provider-leak rule, OpenAPI wiring                                                                         | high (M2/M3)     |
| **`provider-connector`**                  | The adapter contract, raw-payload retention, mapping purity, sync-run/idempotency/retry rules — reused verbatim when the real Booking Manager & NauSYS connectors land            | high (M2, later) |
| **`stripe-payments`**                     | Test-mode PaymentIntents, webhook signature + dedup, deposit/full policy, refund-on-provider-reject                                                                               | med (M5)         |

> Note: the three "repo-specific" skills mostly restate Appendix A / §4–§6 of the architecture doc — cheap to author, and they make the new subagents below reliable.

### Agents to add (`.claude/agents/*.md` — none exist today)

Custom subagents keep each authoring loop scoped and let you fan out. Suggested set (create with `/agents` or by writing the md files):

| Agent                                    | Role                                                                             | Backed by skill(s)                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| **`drizzle-schema-author`**              | Writes/edits schema files to our conventions, runs `db:push`, verifies in studio | `drizzle-conventions`, `better-auth-best-practices` |
| **`orpc-contract-author`**               | Adds procedures + Zod DTOs, registers on `appRouter`, keeps provider shapes out  | `orpc-contract`, `hono`                             |
| **`provider-adapter-author`**            | Builds `ProviderAdapter` impls, fixtures, mapping layer, sync plumbing           | `provider-connector`                                |
| **`payments-statemachine-author`**       | M5 reservation states + Stripe + webhooks                                        | `stripe-payments`, `hono`                           |
| **`pricing-engine-author`** _(optional)_ | M4 pricing pipeline + price rules                                                | `orpc-contract`                                     |

### Built-in agents (use as-is)

- **`Explore`** — fan-out reads (query hotspots, "where is X wired") without dumping files.
- **`Plan`** — sequencing a milestone before you touch code.
- **`general-purpose`** — multi-step research (e.g. NauSYS/BM field mapping once the PDF/credentials are readable).
- **`/code-review`** (+ `security-review`) — before merging M5 payments especially.

### Suggested order of adoption

1. Author `drizzle-conventions` + `orpc-contract` skills → create `drizzle-schema-author` + `orpc-contract-author` agents → run M2-1..M2-6, M2-11.
2. Author `provider-connector` skill → `provider-adapter-author` agent → M2-7..M2-10.
3. Before M5, author `stripe-payments` → `payments-statemachine-author`.
