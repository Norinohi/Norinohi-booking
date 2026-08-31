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

### D-CREWLIST — Do we keep our own crew-list form? · **DECIDED: yes, we collect it ourselves** · Aug 2026

NauSYS confirmed the crew list is the **charter company's** legal obligation, that the base collects it on arrival if it is incomplete, and that forwarding the customer the reservation's `crewlistlink` would have been acceptable. **We are not taking that option.** The customer fills the crew list in on our own booking page and we pass it to the operator, rather than sending them to `crew.nausys.com`.

- **Built:** the crew-list panel on `/bookings/[id]`, over the `booking.travellers.*` procedures that already existed with no UI. Date of birth and document number are encrypted at rest and returned by no other procedure.
- **Not built yet:** the push to NauSYS. `crewlist/v6/set2` is not in this repo and its path is not discoverable — every plausible spelling under `/CBMS-external/rest/crewlist/v6/` answers 404 on production while `catalogue/v6/countries` answers 200 on the same credential. **Blocked on the vendor's spec** (PDF pages ~134-153, or their Swagger).
- **Consequence while it is blocked:** what a customer types is stored but reaches no operator, so the base will still ask at the desk. That is the same outcome as not filling it in — it is not a regression, but it is not the promise the panel's wording makes either, so this should not sit unfinished for long.
- **`booking.crew_list_link` stays.** It costs one nullable column, it is what the connector already reads, and it is the fallback if the push turns out to be unavailable to our credential.

### D-PAYORDER — Deposit policy default + payment ordering · **owner: us + product** · **needed by: M5**

Two parts: (1) what's the default payment policy — 50% deposit, 100% prepayment, or per-listing? (2) Do we take the customer's money **before** or **after** we commit the booking with the provider? Part (2) depends on the provider answer **Q-AVAIL** below.

- **What ships either way:** payment policy is fully configurable per quote; the demo already supports both 50% and 100%. This decision only sets the **default** and the ordering.

---

## 3. Questions to send to the providers (Booking Manager & NauSYS)

These aren't ours to decide — they're to **forward to the providers** so answers land before we build the live connectors. Grouped so they can be pasted into an email. Most apply to **both** providers.

**✅ Answered (NauSYS, Aug 2026)** — a second round closed the questions that gated taking money: `amount` on an extra is a **unit price** and `totalPrice` is `amount × quantity` (their documentation example showing otherwise is a mistake they will fix); an extra is **removed** by sending `updateExtras` with `quantity: 0`, subject to the line's `editable` flag and impossible after confirmation; **`clientPrice` is the final customer amount, VAT included**, with nothing to add on our side; an agency discount comes out of our commission and is capped by **`maxDiscountFromCommission`** (amount-or-percentage still to confirm); **live booking-flow calls are exempt** from the sequential-only rule, so a catalogue sync no longer blocks a checkout price check; `countryId` in `createInfo` is the NauSYS country id matched via `code2`; and **crew lists may be handed to the customer as the vendor's `crewlistlink`** rather than collected and posted by us (the link is now carried from the reservation through to `booking.get`; what remains is the product call on our own crew-list form, which is never forwarded to NauSYS and so satisfies no operator's obligation — see D-CREWLIST below). Detail and the code each answer changed: [`nausys-api-v6-backend-map.md`](./nausys-api-v6-backend-map.md) §8.

**✅ Answered (Booking Manager, Aug 2026, support@mmksystems.com)** - the date/time & timezone questions: non-`/offers` calls use a **fixed CET clock that observes DST**; requests are `yyyy-MM-ddTHH:mm:ss` with a literal `T` and **mandatory seconds**, responses are space-separated `yyyy-MM-dd HH:mm:ss`; **no offset or `Z` suffix in either direction**, and no per-base zone is exposed. `/offers` takes `00:00:00` and the vendor substitutes the base's real check-in/check-out time. Details in [`booking-manager-api-backend-map.md`](./booking-manager-api-backend-map.md) §5.

### Highest priority (they shape the booking flow and matching)

1. **Availability & price guarantee** — When your API returns an available yacht with a price, is that price/slot **firm for a period of time**? Do you offer a real **hold/option**, and if so what's its **expiry**? Does placing an option **lock the price and availability**? _(shapes our booking state machine)_
2. **Change notifications** — Do you provide **webhooks / events** for changes to price, availability, options, or cancellations — or must we **poll**? _(shapes how fresh our data stays)_
3. **Stable IDs for matching** — The same yacht/operator can appear in both your system and the other provider's. Do you expose **stable identifiers** (e.g. hull/MMSI/IMO, operator codes) we can use to **safely match** records across providers? _(shapes duplicate handling)_

### Access & operations

4. **Agency permissions** — With our agency credentials, which operations can we perform: create options/bookings, add extras, access invoices, manage contacts? Any read-only limits?
5. **Rate limits & bulk sync** — What are the request **rate limits**, page sizes, timeouts, and retry expectations? Is there a **bulk/delta catalogue** endpoint (e.g. "changed since" timestamp)?
6. **Access scheduling** _(Booking Manager)_ — Access needs a commercial proposal + online T&C, then a **1-month free trial** (full data + a demo fleet for test bookings). We'd like to **time that trial to overlap our connector build** so it isn't spent during mock-only phases — what lead time do you need?

### Commercial & data

7. **Pricing semantics** — We see `priceListPrice`, `agencyPrice`, and `clientPrice` (NauSYS). Please confirm which the customer pays, where our **commission** sits, how **VAT** and **currency conversion** are handled, and what **agency discounts** we're allowed to apply. _(please confirm the Booking Manager equivalents too)_ — **NauSYS answered:** the customer pays `clientPrice`, VAT included and final; a discount comes out of our commission, capped by `maxDiscountFromCommission`. Still open for Booking Manager, and for the units of that cap.
8. **Option/cancellation semantics** — Exact **option expiry**, **cancellation windows**, penalties, and who may cancel.
9. **Media rights** — May we **cache and transform** your photos (via our image pipeline / Cloudinary) and display them on our site, or must we hotlink? Please point to the relevant **Terms & Conditions**.
10. **Customer & crew data** — Which customer/crew fields are **required** for a booking, and what are your **retention / data-processing** terms (for GDPR)? Who owns invoice generation? — **NauSYS answered the crew half:** the crew list is the charter company's legal obligation, not NauSYS's, and we may forward the customer the reservation's `crewlistlink` instead of collecting passport data ourselves. Retention/processing terms and invoice ownership are still open.

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

### F4 — Booking-status writes bypass the state machine · **the illegal transition is FIXED; three writes still unchecked**

**Resolved part.** `expireBookingsWithDeadQuotes` swept bookings in `["QUOTED", "OPTION_PENDING"]` to `QUOTE_EXPIRED`, and `OPTION_PENDING → QUOTE_EXPIRED` was not in the §6 table. The sweeper was right and the table was missing the edge, so the edge was added.

The deciding detail: `hold_expires_at` is only written on the move to `OPTION_HELD`, and `expireHolds` requires it to be non-null. So an `OPTION_PENDING` booking is unreachable from the hold sweep — it holds no option at all (`provider_option_id` and `hold_expires_at` both still null) and is reached only through its quote. Calling that `OPTION_EXPIRED` would claim a hold lapsed that was never obtained; `QUOTE_EXPIRED` is what actually happened. Confirmed live: sweeping such a booking reports `holdsExpired: 0, bookingsQuoteExpired: 1`.

Both expiry sweeps now declare their `from`/`to` pairing as a constant in `booking-state.ts` next to the table, go through `assertTransition`, and are covered by [`services/expiry-sweeps.test.ts`](../packages/api/src/services/expiry-sweeps.test.ts) — which fails with `expected [ 'OPTION_PENDING' ] to deeply equal []` if the edge is removed again. The pairing was invisible before because a SQL status filter in one place and a status literal in another are each individually reasonable.

**Still open.** Three writes remain unchecked against the table, all in the provider-confirmation path. Each is table-legal today and each does compare-and-set on the previous status, so this is drift protection rather than a live bug:

- [`services/booking-confirm.ts:102`](../packages/api/src/services/booking-confirm.ts) → `CONFIRMED`
- [`services/booking-confirm.ts:138`](../packages/api/src/services/booking-confirm.ts) → `PROVIDER_REJECTED`
- [`services/booking-confirm.ts:143`](../packages/api/src/services/booking-confirm.ts) → `REFUND_PENDING`
- [`services/invoice.ts:187`](../packages/api/src/services/invoice.ts) → `CANCELLED`

Routing these through `assertTransition` too would make `booking-state.ts`'s claim to be the only writer finally true. It is deferred only because `booking.ts`'s `transition()` helper should move into `booking-state.ts` at the same time, which touches the checkout path.

<details>
<summary>Original finding, for context</summary>

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

</details>

Related and still open: `assertTransition` throws a plain `InvalidTransitionError`, and only `booking.ts` catches it. The same guard therefore surfaces as a 409 on one path and a 500 on another (`checkout.ts`, `payment.ts`).

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

### F7 — Catalogue aggregates compare and sort minor units across currencies · **owner: product** · **needed by: before the USD fleet is promoted**

`listing_search_doc.price_from_minor` is stored in whatever the provider publishes in, named by `listing_search_doc.currency`. Every catalogue-wide aggregation over that column treats the integers as if they were one unit.

Measured on the local sync (August 2026):

|                             | EUR     | USD    |
| --------------------------- | ------- | ------ |
| `listing_price_period` rows | 912,095 | 10,030 |
| `listing_search_doc` rows   | 17,782  | 269    |
| ...of those, priced         | 16,580  | 186    |

Six countries hold priced listings in both currencies: Bahamas, British Virgin Islands, Caribbean, Maldives, Thailand, USA. Everything else is single-currency, and United States Virgin Islands is pure USD.

**Where it bites**

1. **Destination "from" price.** `listFacetOptions` groups by country and takes `min(price_from_minor)` with `min(currency)` as the label, so the number and its label come from two independent aggregates. In four of the six mixed countries the EUR minimum happens to be the lower integer, so the pair is accidentally consistent. In two it is not, and Popular Destinations renders a USD amount with a euro sign: **British Virgin Islands "From €1,969"** is _Peanut Oceanis 30.1_ at $1,969, and **USA "From €5,509"** is _Miss Daisy Dufour 37_ at $5,509. (Bahamas renders €1,925 off a genuine EUR listing, so that card is right today. It is right by luck, not by construction.)
2. **The price filter and its slider bounds.** The range facet takes `min`/`max` over the same mixed column and labels it with `coalesce(min(doc.currency), 'EUR')`; the web side formats it with the `"eur"` named format unconditionally. The `WHERE` clause then compares `price_from_minor` against the submitted bound directly, so a USD listing is filtered against a euro number.
3. **Price sorting.** `charterSearch.results` orders on `coalesce(doc.price_from_minor, ...)` across currencies, as does the popular-yachts ordering at `repository.ts:1017`.

- [`search/repository.ts:1377`](../packages/db/src/search/repository.ts), [`:1397`](../packages/db/src/search/repository.ts) — the facet `min(price)` / `min(currency)` pair
- [`search/repository.ts:553`](../packages/db/src/search/repository.ts) — the price-range facet
- [`search/repository.ts:1208`](../packages/db/src/search/repository.ts), [`:1211`](../packages/db/src/search/repository.ts) — the price bounds in `whereClause`
- [`search/repository.ts:1836`](../packages/db/src/search/repository.ts) — the price sort expressions
- [`filters/components/sections/specs-section.tsx:68`](../apps/web/src/components/shared/form/filters/components/sections/specs-section.tsx), [`home/components/budget-finder.tsx:64`](../apps/web/src/features/home/components/budget-finder.tsx), [`filters/hooks/use-filter-chips.ts:32`](../apps/web/src/components/shared/form/filters/hooks/use-filter-chips.ts) — the hardcoded `"eur"` format

Note what is **not** affected: the live quote path already answers in one currency (NauSYS returned EUR for a USD-listed Bahamas boat), and per-listing display was fixed in August 2026 when `useMoney()` started taking a currency. This is the catalogue projection alone.

**The options**

**A. Convert at sync into a single catalogue currency.** `rebuildListingSearchDocs` writes `price_from_minor` already converted, and `currency` becomes a constant. Every aggregate, filter and sort is then correct with no query changes, and the frontend's hardcoded `"eur"` format becomes true rather than a bug.

The cost is that the catalogue stops showing the published price. A USD fleet's card would read €1,693 while the operator's own site says $1,969, and the number moves whenever the rate does. It also needs a real FX source and a staleness policy: what rate, refreshed how often, what happens when the fetch fails mid-sync, and whether a card may show a price converted at a rate from three days ago. The ECB daily reference feed is free, keyless and EUR-based, which fits, but it is published once per working day and has no weekend value.

**B. Store a normalised `price_from_minor_eur` beside the published figure.** The published `price_from_minor` and `currency` stay exactly as they are and remain what the card renders. The new column exists only to be compared: the facet minimum, the range bounds, the `WHERE` clause and the two sort expressions all move onto it, and the destination card's number is then chosen by the normalised value but displayed from the published pair.

This keeps the operator's own number on screen and makes ordering honest. It costs a second index (the existing `listing_search_doc_price_idx` and the two sort indexes at [`schema/search.ts:120`](../packages/db/src/schema/search.ts) would need normalised twins), and it still needs the same FX source and staleness answer as A, just with less exposure: a stale rate misorders results rather than misquoting a price. It also leaves one visible oddity, that a slider labelled in euro can return a card priced in dollars, which is arguably honest and arguably confusing.

**C. Scope the catalogue to one currency per market.** Pick the presentation currency from the market the user is browsing and filter the projection to it, so no aggregate ever spans two. No FX source, no staleness, no converted prices.

The cost is coverage: British Virgin Islands is 228 EUR and 174 USD listings, so a currency-scoped BVI search hides roughly 43% of the fleet whichever side is chosen, and United States Virgin Islands disappears entirely from a EUR market. That is a product decision about inventory visibility, not a technical one.

**D. Stopgap: exclude non-base listings from aggregates only.** Add `and doc.currency = 'EUR'` to the facet minimum, the range facet and the price `WHERE` clause, leaving the listings themselves searchable and sortable by everything else. The wrong destination prices go away the same day, at the cost of the 186 priced USD listings being unreachable through the price filter and carrying no contribution to any "from" price. Cheap, reversible, and it buys time for A or B without pretending to be either.

**Decision needed:** which of A, B or C, and if A or B, where the rate comes from and how stale it may be. Ties to F2 above, which asks the same FX question about credit balances, and to the §4 assumption that multi-currency is handled by re-quoting rather than mixing. If both F2 and F7 land on "we have an FX source", it should be one source, wired once.
