# What is left, and what we are waiting on

Written 2026-08-25 against `staging` at `5e42f3c`. It corrects
[`task-breakdown.md`](./task-breakdown.md), whose M4 and M5 sections still read as todo although
both shipped, and gathers the open items from
[`open-questions-and-decisions.md`](./open-questions-and-decisions.md),
[`generated-content-audit.md`](./generated-content-audit.md) and the two vendor question lists into
one list somebody can act on.

## 1. Where the build actually stands

| Milestone                      | Doc says | Code says                                                                                                                                                  |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M2 schema, contracts, mock     | done     | done                                                                                                                                                       |
| M3 search and availability     | mostly   | done, bar two deliberate deferrals (`facet_dictionary`, the production-scale perf pass)                                                                    |
| M4 pricing                     | **todo** | **done**. `services/pricing.ts` runs provider price, then `price_adjustment_rule`, then discount, then payment policy, and the Manage Prices screen exists |
| M5 booking and Stripe          | **todo** | **done**. 14-state machine, Stripe PaymentIntents, signed webhook, refunds, expiry sweeper, encrypted traveller PII                                        |
| M6 observability               | todo     | **not started**. No Sentry package anywhere; the env vars are scaffolding only                                                                             |
| M7 availability as constraints | partly   | as documented; the open items in §2.4 are real                                                                                                             |

Also shipped and not in that table: two live connectors (NauSYS and Booking Manager) with
raw-payload retention and sync runs, five Railway cron services, a staff panel (bookings, payments,
invoices, listings, prices, discounts, duplicates, sync, audit, inbox), leads and enquiries,
referrals, credits and loyalty, invoices, guest checkout with access tokens, and four locales
(`en`, `es`, `uk`, `de`).

`staging` is seven commits ahead of `main`; the in-flight work is provider extra and facet
translations.

## 2. Left to implement

### 2.1 Defects in the money path

These are ours to fix, not questions for anyone.

1. ~~**Referral money ignored currency.**~~ **Fixed 2026-08-25.** Every summing read of
   `credit_ledger` is now scoped to one currency, `CREDIT_CURRENCY` names the one credit is minted
   in, and `spendableCreditMinor` refuses a quote priced in any other rather than converting at an
   invented rate. `redeemCredit` repeats the scope inside the transaction, so a quote priced before
   the rule existed spends nothing instead of trusting its stored figure. `welcomeDiscountMinor`
   carries the same guard: the €100 invitee discount and the €1000 eligibility threshold are amounts
   in one currency, not bare numbers to be re-read as whatever the quote is priced in, and a quote
   we cannot honour them against leaves the redemption pending for the next one. The Referrals and
   Credits screens also stop labelling a cross-currency sum as EUR.
2. **Two definitions of "payable now" coexist.** `pricing.payableNowMinor` sums the lines marked
   `now`, while `checkout-amounts.amountDue` subtracts the at-check-in lines from the stored
   `total_minor`. They agree only while no clamp fires. `totalMinor` clamps at zero, so a discount
   larger than the charter leaves the stored total at zero with the at-check-in lines still
   positive, and the figure the quote was sized against is no longer the figure checkout charges.
   Worth a test that drives a discount past the total, and then one definition.
3. **Card versus detail prepayment.** The reported symptom is a fixed 25% on the search card
   against a real 50% on the detail page (Liburna Sunseeker Predator 50: 3,615 EUR of 14,460 EUR).
   I could not find it in the current tree: `presenters/listing.ts` says the fabricated prepayment
   was replaced by the provider's own security deposit, and there is no 25% figure left in
   `apps/web/src`. Re-check against the deployed build before raising it; the observation may
   predate that change.

### 2.2 Blocks taking real money

4. **Observability (M6).** Nothing is wired: no Sentry, no domain fields on the evlog wide events,
   no alerts on sync failure, webhook lag or provider error rate. The first production payment
   failure is currently invisible.
5. **NauSYS crew-list submission.** The panel on `/bookings/[id]` collects and encrypts crew data
   that reaches no operator, because `crewlist/v6/set2` is not discoverable on our credential. The
   customer is promised something we do not do. Blocked on the vendor spec (§4).
6. **Booking Manager reservation safety.** `POST /reservation` has no idempotency key we could
   find, so a timed-out create cannot be told from a successful one without risking a double
   booking, and a confirmed reservation has no cancel path that works. Either the vendor answers
   (§4), or we design around it with a pre-create probe and a reconciliation sweep.
7. **Invoice legal identifiers.** `packages/api/src/lib/company.ts` ships placeholder VAT,
   registration and IBAN values. One line of work, but no real invoice can be issued until they
   are real.
8. **Stripe live mode.** Only test keys are wired. Needs the live account, its webhook endpoint on
   the production URL, and a pass over checkout with live keys.

### 2.3 Content we present as sourced but generate

From [`generated-content-audit.md`](./generated-content-audit.md). Each needs a product decision
before it needs code.

9. **"Suggested route" is invented.** Coordinates are the base's lat/lng plus a fixed offset, and
   only Dalmatia has named stops, so 90 of 109 NauSYS listings fall through to "Island bay", "Old
   town", "Quiet cove". It renders on a map as advice about where to sail. Neither provider
   supplies itineraries, so this is editorial content, a hand-written route per region, or the
   section goes.
10. **Payment methods** are hardcoded identically for every operator, under that operator's name.
    No provider has the field.
11. **Pickup and drop-off dates** show the availability window rather than the charter's dates. The
    times beside them are real. Either show the times alone, or move the block behind a selected
    period.
12. **FAQ** has a table and no rows for real listings. Options: (A) one shared set with variations
    by yacht type, (B) a one-off AI generation into the seed with a human read-through, (C) AI at
    runtime (subscription, per-request cost, and the risk of inventing facts about a specific
    yacht), (D) a tab in the admin panel. A now, D later, is the sensible pair.
13. **Reviews.** Providers do not expose them. Options: hide the block until the first bookings;
    collect by email after the charter (the pipeline already runs, so it needs a template and a
    page); pull Google Reviews per company; enter them by hand in the admin panel.

### 2.4 Availability and pricing gaps (M7 tail)

14. **Daily rates.** The NauSYS loader maps `WEEKLY` price lists and drops `DAILY`. 104 of 109
    yachts advertise `minimumShortPeriodDuration: 3` while only 2 have a daily price list, so short
    breaks are advertised and unsellable. `listing_price_period.kind` is ready for them.
15. **`max_nights` is null on every listing**, so the calendar cannot cap a range from above.
16. **Seasonal check-in rules.** `listing_checkin_rule` has no validity period, so a listing whose
    check-in day changes by season cannot be expressed.

### 2.5 Platform and quality

17. **Cache Components adoption.** Around 25 routes carry an `instant = false` opt-out with a TODO,
    including listing detail, results, booking and payment.
18. **Perf pass at production volume.** The 200 ms p95 target has never been measured against a real
    import; the local seed is too small to mean anything.
19. **`facet_dictionary`** for stable translated labels, deferred until the admin needs to own them.
20. **Translation coverage.** `uk` and `de` have no provider behind them and are marked `generated`;
    the long tail of Booking Manager extra names is deliberately untranslated. The backfill script
    has to be run per fleet after each import.
21. **Docs.** `docs/railway-deployment.md` is referenced by `AGENTS.md` and does not exist;
    `task-breakdown.md` M4 and M5 need marking done.

## 3. Waiting on the client

### 3.1 Keys and access

| What         | State        | What is needed                                                                   |
| ------------ | ------------ | -------------------------------------------------------------------------------- |
| Mapbox       | dev token    | Production token with billing and a URL restriction on the production domain     |
| Cloudinary   | dev (`demo`) | Production cloud name plus a plan; 109 listings is roughly 2-3k transformations  |
| Google OAuth | unset        | Client id and secret, redirect URI `${BETTER_AUTH_URL}/api/auth/callback/google` |
| Stripe       | test sandbox | Live keys plus a webhook endpoint on the production URL                          |
| Sentry       | none         | DSN for server and web, plus a plan                                              |
| Analytics    | none         | Which tool and whose account: GA4/GTM, PostHog or Plausible                      |

Already in hand: Resend, Calendly, the production domain and DNS.

Generated by us, but they need to exist per environment: `ENCRYPTION_KEY` (rotating it makes stored
traveller documents unreadable), `CRON_SECRET`, `REVALIDATE_SECRET`. The final host split also fixes
`CORS_ORIGIN`, `COOKIE_DOMAIN`, `COOKIE_PREFIX`, `NEXT_PUBLIC_APP_URL` and `OPENAPI_SERVER_URL`.

### 3.2 Provider access

- **NauSYS.** Our credential currently sees one test company. We need production credentials, or
  confirmation that these same ones open the full catalogue, otherwise the catalogue on production
  is empty. Plus the list of `companyId` values to import and to exclude.
- **Booking Manager.** Access opens as a one-month trial. The start date has to be agreed so it does
  not burn while we are on mocks, and we need to know how long the vendor takes to issue the key.
- **Publication policy**: do newly imported yachts publish on sight or land as drafts
  (`PROVIDER_AUTO_PUBLISH`)? Today only `nausys` auto-publishes.

### 3.3 Site content

Languages and translations, currencies, logo, favicon and OG image, footer contacts, who fills the
SEO landing pages, and the legal pages Stripe needs for verification.

### 3.4 Decisions before release

1. **Default payment policy**: 50% or 100%, and whether we charge before or after the provider
   confirms.
2. The card versus detail prepayment discrepancy (§2.1 item 3), if it reproduces on the deployed
   build.
3. The two "payable now" formulas (§2.1 item 2).
4. Credits not filtered by currency (§2.1 item 1).
5. **Referral programme**: amount, validity period, conditions.
6. **Duplicates**: currently the cheaper option for the customer, with Booking Manager winning ties.
   Confirm or change.
7. **Auto-publish or moderation** for imported listings.
8. **FAQ and reviews tabs in the admin panel**, and in which release.

### 3.5 Operational

How many staff accounts; where alerts about sync failures and Stripe webhook lag should go; database
backups; and who makes the first real-money test booking on production.

## 4. Waiting on the vendors

### NauSYS

- **Test credentials for `ws-test.nausys.com`.** Ours is production-only, so the booking chain can
  only be exercised against real inventory. Ask before anything else calls `createInfo`.
- **The `crewlist/v6/set2` spec** (PDF pages roughly 134-153, or their Swagger). The single item
  blocking §2.2 item 5.
- **`maxDiscountFromCommission`**: a percentage or an amount?
- **Short breaks**: 104 of 109 yachts carry `minimumShortPeriodDuration: 3` but only 2 have a
  `DAILY` price list, and a weekly rate cannot price three nights. Does the Saturday constraint
  still apply to a short charter, and where does the price come from?
- **`optionTill` carries no timezone.** We assume `Europe/Zagreb`. Confirm, otherwise we hold longer
  than the vendor does.
- Rate limits, pagination and retry guidance; any bulk or delta catalogue endpoint; webhooks.

### Booking Manager (MMK)

The v2 list in [`docs/vendor/booking-manager-questions-v2.md`](./vendor/booking-manager-questions-v2.md)
went out 2026-08-20 and is unanswered. What matters most:

- **Q10 idempotency** on `POST /reservation`, and what undocumented `status 9` is. The largest open
  risk.
- **Q7 cancelling a confirmed reservation.** Every documented path returns
  `400 Reservation already confirmed`. Includes a request to delete the stuck probe booking
  `8178244520000100225`.
- **Q8**: is there any amendment path at all?
- **Q4 agency payment plan.** We currently derive the guest's deposit from our own supplier
  obligation, because nothing in the payload distinguishes the two.
- **Price semantics.** NauSYS confirmed the customer pays `clientPrice`, VAT included. Which fields
  correspond in Booking Manager? (Q1 on the VAT base, Q2 on the discount cap, Q3 on the security
  deposit, Q5 on reservation status 11.)
- **Rate limit.** Not published. We measured `SWEEP_CONCURRENCY=12` as workable (7.3 min for a full
  run, no `sync_error` rows), but that is empirical. What is the real limit, and what comes back
  when it is exceeded?
- **Delta endpoint.** `/yachts` takes only `companyId`, so a production credential means roughly
  1300 requests per run. Is there a bulk or changed-since call, and is `lastSyncPoint` it?
- Five documentation defects to confirm, including `companyId` versus `company` on `/availability`
  (following the spec silently widens every request to the whole account) and two different FX
  tables inside one response.

### Both providers

Whether a quoted price is held and for how long; the real option TTL and whether it locks the price;
webhooks or polling; stable ids (hull, MMSI, IMO) for matching a yacht between systems; and which
operations our key is allowed to perform.

## 5. Suggested order

1. **Chase, because the latency is external**: NauSYS production and test credentials plus the
   crew-list spec; Booking Manager trial timing, Q7 and Q10.
2. **Chase the client**: the keys in §3.1, then the decisions in §3.4.
3. **Fix**: the three money-path defects in §2.1, which are ours alone and cost the customer money.
4. **Build**: observability, then the content decisions in §2.3, then daily rates and `max_nights`,
   then Cache Components and the perf pass.
