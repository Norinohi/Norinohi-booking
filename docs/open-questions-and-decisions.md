# Open Questions & Decisions

A living checklist of everything still to confirm before or during the build — written so anyone on the team (or product/business, or the providers) can read an item and act on it without digging through the architecture.

**Companion docs:** [`backend-architecture.md`](./backend-architecture.md) (the full model), [`task-breakdown.md`](./task-breakdown.md) (the tasks), [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md) (NauSYS connector reference).

**Bottom line first:** nothing here blocks starting **M2** (schema + oRPC contracts + mock fixtures). Every open item below is scheduled for a later milestone or is a question to forward to a provider. The one item worth a quick word soon is the **Manage-Price scope** (D-MPRICE-SCOPE), because it changes how much of M4 counts as "core."

---

## 1. Already decided (so we don't re-open them)

| #                     | Decision                             | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-MONEY               | How money is stored                  | Integer **minor units** + ISO currency for amounts (2 decimals preserved as the last integer digits); percentages as exact decimals. Stripe-native, no floats.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-ID                  | Primary keys                         | `text` IDs with a typed prefix (`ylst_`, `bkg_`, `qte_`…) via a shared `id()` helper. Matches the existing auth tables.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Q-ADMIN               | How staff are identified             | A `role` column on the `user` table (Better Auth admin plugin left for later).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-TEST                | Testing                              | Vitest for the risky core only — mapping, pricing math, the booking state machine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-LOCALE              | Which languages the product ships in | **`en` (default) + `es` + `uk`**, taken from the design — the language menu in Figma node `972:54534`. Locale lives in a cookie, no URL prefix, so the route groups stay untouched. Language names are shown **translated** ("Spanish" / "Іспанська"), per the design, not as endonyms. Adding a locale = one `messages/<locale>.json` plus an entry in `src/i18n/config.ts`.                                                                                                                                                                                                                                                                     |
| D-MSGS                | i18n message payload                 | Ship the **whole active-locale dictionary** from the root provider — deliberately **no per-segment `pick()`**, and **one file per locale** rather than per-namespace files. Measured at ~6 KB gzip, 5–6% of a page response; only one locale is ever loaded. Narrowing it would move key coverage from compile time to **runtime** (`global.d.ts` types the full dictionary regardless of what the provider actually receives), so a missed namespace becomes a `MISSING_MESSAGE` no gate catches. Revisit both when the bundle passes **~20 KB gzip** (booking + checkout + admin) — they share the same trigger and are cheapest done together. |
| Vocabulary + modeling | Naming & data model                  | Reconciled names (`operator`, `amenity`, `booking`, `provider_record` + `listing_source`, `price_adjustment_rule`); generic provenance model; fuller state machine with refund states; `payment_schedule` for deposit + balance; PII controls + explicit MVP exclusions.                                                                                                                                                                                                                                                                                                                                                                          |

---

## 2. Decisions we still owe (internal — us / product / team lead)

None are due right now. Each says who decides, when it's needed, and what gets built regardless so nothing stalls.

### D-MPRICE-SCOPE — Is the internal "Manage Price" admin screen part of the 1 Sep demo? · **owner: team lead** · **needed by: M4**

The client confirmed "Manage Price" is a tool **for us**, not for yacht owners — it lets our team adjust the provider's recommended price (e.g. add a discount to one listing, or a group of listings, for a chosen season period). The team-lead sprint board, however, lists "Manage Prices" as deferred (it was grouped with the owner/operator role, which is out of scope).

- **What ships either way:** the pricing engine, the `price_adjustment_rule` data model, and the audit trail — so quotes already honour internal price overrides (seeded for the demo).
- **The open question:** do we also build the **staff-facing screen** (create/edit/preview rules) for the 1 Sep demo, or leave it as a fast-follow?
- **Why it matters:** it's the difference between M4 being "pricing pipeline only" vs "pipeline + an admin UI."

### D-RULES — How do price rules and discounts combine? · **owner: product** · **needed by: M4**

When more than one adjustment applies to the same listing/date, do they **stack** (e.g. −10% then −5%) or does the **highest-priority one win**? And are rule date-windows matched against the **travel dates** or the **booking date**?

- **What ships either way:** the rule table and targets exist; only the resolution logic depends on this.

### Referral & discount mechanics — What are the actual rules? · **owner: product** · **needed by: M4 (the UI is M5)**

Who earns a referral reward, how much, and when does it apply — at signup, at first booking, as a code at checkout? Same for promo codes: fixed amount or percentage, per-user limits, expiry, which listings.

- **What ships either way:** the `referral` / `discount` / `promo_code` schema exists; these are the business rules that fill it in. The backend must be ready in **M4** because the referrals/discounts **UI is an M5** task.

### D-PAYORDER — Deposit policy default + payment ordering · **owner: us + product** · **needed by: M5**

Two parts: (1) what's the default payment policy — 50% deposit, 100% prepayment, or per-listing? (2) Do we take the customer's money **before** or **after** we commit the booking with the provider? Part (2) depends on the provider answer **Q-AVAIL** below.

- **What ships either way:** payment policy is fully configurable per quote; the demo already supports both 50% and 100%. This decision only sets the **default** and the ordering.

---

## 3. Questions to send to the providers (Booking Manager & NauSYS)

These aren't ours to decide — they're to **forward to the providers** so answers land before we build the live connectors. Grouped so they can be pasted into an email. Most apply to **both** providers.

### Highest priority (they shape the booking flow and matching)

1. **Availability & price guarantee** — When your API returns an available yacht with a price, is that price/slot **firm for a period of time**? Do you offer a real **hold/option**, and if so what's its **expiry**? Does placing an option **lock the price and availability**? _(shapes our booking state machine)_
2. **Change notifications** — Do you provide **webhooks / events** for changes to price, availability, options, or cancellations — or must we **poll**? _(shapes how fresh our data stays)_
3. **Stable IDs for matching** — The same yacht/operator can appear in both your system and the other provider's. Do you expose **stable identifiers** (e.g. hull/MMSI/IMO, operator codes) we can use to **safely match** records across providers? _(shapes duplicate handling)_

### Access & operations

4. **Agency permissions** — With our agency credentials, which operations can we perform: create options/bookings, add extras, access invoices, manage contacts? Any read-only limits?
5. **Rate limits & bulk sync** — What are the request **rate limits**, page sizes, timeouts, and retry expectations? Is there a **bulk/delta catalogue** endpoint (e.g. "changed since" timestamp)?
6. **Access scheduling** _(Booking Manager)_ — Access needs a commercial proposal + online T&C, then a **1-month free trial** (full data + a demo fleet for test bookings). We'd like to **time that trial to overlap our connector build** so it isn't spent during mock-only phases — what lead time do you need?

### Commercial & data

7. **Pricing semantics** — We see `priceListPrice`, `agencyPrice`, and `clientPrice` (NauSYS). Please confirm which the customer pays, where our **commission** sits, how **VAT** and **currency conversion** are handled, and what **agency discounts** we're allowed to apply. _(please confirm the Booking Manager equivalents too)_
8. **Option/cancellation semantics** — Exact **option expiry**, **cancellation windows**, penalties, and who may cancel.
9. **Media rights** — May we **cache and transform** your photos (via our image pipeline / Cloudinary) and display them on our site, or must we hotlink? Please point to the relevant **Terms & Conditions**.
10. **Customer & crew data** — Which customer/crew fields are **required** for a booking, and what are your **retention / data-processing** terms (for GDPR)? Who owns invoice generation?

---

## 4. Working assumptions (flag any that are wrong)

We've defaulted these to keep moving; each is labelled `[ASSUMPTION]` in the architecture. Say the word and we'll change any of them.

- **Geo search** uses plain Postgres (bounding-box math), **no PostGIS**, for the demo.
- **Search speed** target ≈ 200 ms p95 locally.
- **One currency per quote** — multi-currency is handled by re-quoting, not mixing currencies in one quote.
- **Connector interface** is named `InventoryProvider`; the mock is `MockInventoryProvider`.
- **Raw provider payloads** are retained and **encrypted at rest** (for replay/audit), never exposed to the web app.
- **Default transacting source** when a yacht exists in both providers: the one with the lower client price at quote time, tie-broken to Booking Manager. _(also listed as Q-DUP for the providers)_

---

## 5. What blocks what (quick reference)

| Milestone                        | Blocked by                                                                                  | Can start now?                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **M2** schema + contracts + mock | nothing                                                                                     | ✅ yes                                           |
| **M3** search + availability     | M2                                                                                          | ✅ after M2                                      |
| **M4** pricing                   | D-RULES, referral mechanics, D-MPRICE-SCOPE _(engine unaffected; only scope/semantics)_     | ✅ engine yes; finalise rules before locking M4  |
| **M5** booking + Stripe          | D-PAYORDER, and provider answers Q-AVAIL / Q-OPT for the live path _(mock path unaffected)_ | ✅ mock path yes; live path needs vendor answers |
| **live connectors** (post-demo)  | provider credentials + all §3 answers                                                       | ⛔ needs vendor access                           |

---

## 6. Admin panel (later)

The admin panel is not in the 1 Sep demo. The sprint board schedules only customer-facing screens, and "Manage Prices" is listed out of scope. The demo runs on seeded mock data, so staff do not import or curate anything by hand. This is the same call as **D-MPRICE-SCOPE** above.

### The backend a panel would sit on is already designed

Everything below is `adminProcedure` (gated by the staff `role`) and writes `audit_log`. These are extension points, not demo deliverables.

| Admin job                                   | Backend endpoints                          | Tables                                                          |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Duplicate review ("is this the same boat?") | `admin.match.queue` / `confirm` / `reject` | `listing_source`, `listing_duplicate_candidate`                 |
| Price overrides ("manage price")            | `admin.priceRule.*` + pricing engine (M4)  | `price_adjustment_rule`, `price_adjustment_target`, `audit_log` |
| Import control and monitoring               | `admin.sync.run` / `status`                | `sync_run`, `sync_error`, `provider_record`                     |
| Cancel a booking                            | `admin.booking.cancel`                     | `booking`, `audit_log`                                          |
| Access control                              | `adminProcedure` + `user.role`             | `user` (role)                                                   |

### What a demo version would cost (frontend, not currently booked)

These are rough estimates for the team lead to sanity-check, not commitments:

- A minimal staff-only page (a duplicate-review list and a price-override form) is roughly a few days of frontend work, plus the matching endpoints from backend. It is not on the sprint board, so it would need time carved out.
- The cheapest way to show price management in the demo is no panel at all: seed a `price_adjustment_rule` and show the discounted quote on a normal yacht page. That costs zero frontend time and still demonstrates the capability.

Decision owner: team lead. If a panel is wanted for the demo, it needs frontend time the board has not allocated; otherwise it stays a clean post-demo add-on.

---

## 7. Behaviour bugs found during the code-quality refactor (August 2026)

Six findings surfaced while refactoring `packages/api` and `packages/db`. **None were fixed**: every one changes what the product does — what a customer is charged, which requests are rejected, or which writes are allowed — so the code was left as-is and the choice is recorded here. The refactor was structured so that none of them moved by accident.

The first three need a product answer. The last three are ours to decide but still change behaviour.

### F1 — Two formulas for "how much do we charge now" · **owner: product** · **needed by: M5 sign-off**

`payableNowMinor` sums the lines marked `payWhen === "now"`. `amountDue` computes `quote.totalMinor − Σ(at_check_in lines)`. Same concept, two implementations, and different call sites use different ones: the quote pipeline uses the first, checkout and card payment use the second.

They agree only while the stored `totalMinor` equals the unclamped sum of the lines — and `totalMinor` is itself clamped at zero, which is enough to break it. A quote whose lines sum negative (an over-large credit or a discount applied at check-in) stores a total of 0, and `amountDue` then subtracts a negative and bills **double** what `payableNowMinor` says is owed. Nothing recomputes the total from the lines at read time, so any future writer that sets one without the other silently changes what the customer pays.

- [`services/pricing.ts:259`](../packages/api/src/services/pricing.ts) `payableNowMinor`
- [`services/checkout.ts:189`](../packages/api/src/services/checkout.ts) `amountDue`
- Both formulas and the exact divergence are pinned in [`services/checkout.test.ts`](../packages/api/src/services/checkout.test.ts) — the tests named `DIVERGE` are the decision.

**Decision needed:** which one is right. Then delete the other and migrate the call sites.

### F2 — Credit and discounts ignore currency · **owner: product** · **needed by: before any non-EUR listing**

`redeemCredit` sums the credit ledger filtered by user and expiry only — there is no currency predicate — so a customer with EUR and USD credit sees one merged balance. Neither `redeemCredit` nor `redeemDiscount` compares the currency it is handed against the booking's, and `discount.currency` is never checked either. Today a EUR credit is spendable against a USD booking at a 1:1 rate.

Harmless while everything is EUR, which is why it has not bitten. It becomes a real loss the day a second currency is listed.

- [`services/loyalty.ts:263`](../packages/api/src/services/loyalty.ts) — the balance query with no currency filter
- [`services/discount-redemption.ts:114`](../packages/api/src/services/discount-redemption.ts) `redeemDiscount`

**Decision needed:** whether credit is per-currency (a EUR balance and a USD balance) or single-currency with conversion. Fixing it reduces the balance mixed-currency users can currently see, so it is not a silent change.

### F3 — The "cannot both take the last one" guards do not serialize · **owner: team lead** · **needed by: M5**

Two places carry a comment saying the transaction stops two simultaneous checkouts both taking the last remaining use. Neither does. Both read a count and then write, under PostgreSQL's default READ COMMITTED, with no row lock — `for update` appears nowhere in the repository. Two concurrent checkouts can both pass the check and both insert.

Worse, the two are in **separate** transactions: `redeemFor` opens one for the discount and another for the credit, so a booking can consume a discount and then fail to consume credit, or vice versa, with no rollback between them.

- [`services/discount-redemption.ts:114`](../packages/api/src/services/discount-redemption.ts) — usage-limit re-check
- [`services/loyalty.ts:263`](../packages/api/src/services/loyalty.ts) — balance re-check
- [`services/booking.ts:461`](../packages/api/src/services/booking.ts) `redeemFor` — the two separate transactions

**Decision needed:** how much overspend is acceptable. `SELECT … FOR UPDATE` on the discount row and the user's ledger, both inside one transaction with the booking, is the straightforward fix; it costs a lock on a hot row at checkout.

### F4 — Five booking-status writes bypass the state machine

`booking-state.ts` says nothing outside it should assign `booking.status`. Five writes do, with no `assertTransition` at all:

- [`services/booking-confirm.ts:102`](../packages/api/src/services/booking-confirm.ts) → `CONFIRMED`
- [`services/booking-confirm.ts:138`](../packages/api/src/services/booking-confirm.ts) → `PROVIDER_REJECTED`
- [`services/booking-confirm.ts:143`](../packages/api/src/services/booking-confirm.ts) → `REFUND_PENDING`
- [`services/expiry.ts:95`](../packages/api/src/services/expiry.ts) → `OPTION_EXPIRED`
- [`services/expiry.ts:136`](../packages/api/src/services/expiry.ts) → `QUOTE_EXPIRED`
- [`services/invoice.ts:187`](../packages/api/src/services/invoice.ts) → `CANCELLED`

All six do use a compare-and-set on the previous status, so they are not unguarded against concurrency — but the §6 table is never consulted, so a transition the table forbids goes through anyway. Checking each site's real from-status domain against the table turns up exactly one live case:

**`expireQuotes` sweeps bookings in `["QUOTED", "OPTION_PENDING"]` to `QUOTE_EXPIRED`, and `OPTION_PENDING → QUOTE_EXPIRED` is not in the table.** (`canTransition("OPTION_PENDING", "QUOTE_EXPIRED")` is `false`; the allowed targets are `OPTION_HELD`, `OPTION_EXPIRED`, `PROVIDER_REJECTED`, `CANCELLED`.) The other five are all table-legal today — they only pass unchecked.

So this is two decisions, not one. First: is a booking that is mid-option-request but whose quote has expired supposed to become `QUOTE_EXPIRED` (add the edge to the table) or `OPTION_EXPIRED` (fix the sweeper)? Second: route all six through `assertTransition` so the module's claim to be the only writer becomes true and the next such drift is caught by the type-and-test gate rather than by a reader.

The 14×14 table is pinned in [`services/booking-state.test.ts`](../packages/api/src/services/booking-state.test.ts), so whichever way the first question goes, the change is visible as a test diff.

Related: `assertTransition` throws a plain `InvalidTransitionError`, and only `booking.ts` catches it. The same guard therefore surfaces as a 409 on one path and a 500 on another (`checkout.ts`, `payment.ts`).

### F5 — Search filters treat zero inconsistently

`whereClause` guards its ~30 filters two different ways. Some test truthiness, some test `!== undefined`. So `maxCabins: 0` filters, while `minCabins: 0`, `guests: 0`, `minPriceMinor: 0` and `maxPriceMinor: 0` are silently dropped.

Normalising them all to `!== undefined` is not a no-op: `minPriceMinor: 0` would then emit `price_from_minor >= 0`, which **excludes** listings with a NULL price. That is a visible change to what search returns.

- [`search/repository.ts:577`](../packages/db/src/search/repository.ts) `whereClause`

### F6 — Search cards and checkout quote different prepayments

The search card advertises a flat 25% prepayment. Checkout resolves the real figure per listing through `resolvePaymentPolicy` — a listing override, then the provider's plan, then a 50% marketplace default.

Confirmed in the running app: the card for _Liburna Sunseeker Predator 50_ says a €3,615 prepayment on €14,460 (25%), and its own detail page says **50% Booking Prepayment For Boat**.

- [`presenters/listing.ts:19`](../packages/api/src/presenters/listing.ts) `CARD_PREPAYMENT_PCT`
- [`services/pricing.ts:240`](../packages/api/src/services/pricing.ts) `resolvePaymentPolicy`

The constant was named during the refactor so the disagreement is visible in the code, but its value was not changed. Fixing it means the card calling the real policy, which changes a number shown on every search result.
