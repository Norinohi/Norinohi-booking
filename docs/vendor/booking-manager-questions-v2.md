Subject: Booking Manager REST API — remaining integration questions from Norinohi (agency key)

Hello,

Since our last message we have measured most of our open list directly against the API on
our agency key, using charter test company 225 and, for statistical checks, read-only
sweeps across the wider account. That removed about two thirds of the questions. What
follows is only what measurement cannot settle, plus a short list of defects we found on
the way that we think you will want to know about.

Everything below was measured on 2026-08-20 against
`https://www.booking-manager.com/api/v2`.

---

## 1. Defects and documentation errors we found

These need no answer beyond a confirm or a fix.

**1.1 `/availability` and `/shortAvailability` take `companyId`, not `company`.**
Specs 2.1.4 and 2.2.1 both document the filter as `company`. Measured:

| endpoint                  | no filter | `?company=225` | `?companyId=225` |
| ------------------------- | --------- | -------------- | ---------------- |
| `/availability/2026`      | 239,551   | 239,552        | 113              |
| `/shortAvailability/2026` | 11,650    | 11,650         | 10               |
| `/prices` (one week)      | —         | 20,477         | 14               |
| `/offers` (one week)      | —         | 3,150          | 7                |

`?company=225` on `/offers` returned 3,150 rows spanning 2,487 distinct yachts, of which
six belong to company 225. Unknown query parameters are dropped silently and never
rejected, so an integrator who follows your specification gets a successful response that
quietly widens every request to the whole account. Please correct the document.

**1.2 A malformed or missing bearer token returns HTTP 500, not 401.**
A token you can parse but not authorise returns `401 Not authorized`. A garbled token, or
no `authorization` header at all, returns a Tomcat error page carrying
`org.glassfish.jersey.server.internal.process.MappableException: java.lang.NullPointerException`
— byte-identical to the response for an unknown path. Any client with a standard status
classifier treats that as a transient outage and retries it. A wrong credential should be
a 401.

Separately, those error pages disclose your stack (Apache Tomcat 8.0.38, Jersey 2.22.1)
and full Java exception class names. Passing that on as a courtesy.

**1.3 Two different FX tables inside one response.**
Queen II, 2027-05-01 → 2027-05-08, requested with `currency=USD`:

| field                   | EUR     | USD     | implied rate |
| ----------------------- | ------- | ------- | ------------ |
| `price`                 | 6000.00 | 7242.00 | 1.20700      |
| `obligatoryExtrasPrice` | 1922.00 | 2059.42 | 1.07150      |
| `securityDeposit`       | 1350.00 | 1446.52 | 1.07150      |

The charter price and the extras/deposit convert at materially different rates, and the
extras rate (USD 1.07150, GBP 0.84540, CHF 0.95120) matches 2024-era levels rather than
current ones. The same split appears in GBP and CHF. We believe the extras table is stale.

**1.4 Silent coercion of invalid input.** An inverted date range returns HTTP 200 with
`dateTo` replaced by a seven-day default. `dateFrom=2026-02-30` silently becomes
2026-03-02. Nothing in the response indicates the server answered a different question
than the one asked.

**1.5 `/prices` returns exact duplicate rows.** Orion (`978989990000100225`, Bareboat)
was returned four times with byte-identical `dateFrom`, `dateTo`, `price` and `startPrice`
in every week we queried. `/offers` collapses it to one. We dedupe, but it looks unintended.

**1.6 `/offers` and `/yachts` return HTML under load.** We saw HTTP 504 Gateway Time-out
with an HTML body three times during the probe, and `/yachts?companyId=` for two larger
companies exceeded 20-25 seconds. We treat a non-JSON body as transient; flagging the
latency in case it is news.

---

## 2. What we measured, and now assume (correct us only if we are wrong)

Stated compactly so you do not have to answer them.

- `price` is the client-payable gross: `startPrice × (1 − discountPercentage/100) == price`
  held in 6,275 of 6,275 offers in an account-wide week sweep.
- Commission is **not** a flat percentage of `price`. `commissionValue == price ×
commissionPercentage/100` held in only 2,829 of those 6,275. The failures cluster on
  exact ratios that track the charter's country (1.12 Greece, 1.13 Croatia, 1.22 Italy,
  1.20 Turkey, 1.04 BVI), which we read as VAT. We now take `commissionValue` verbatim and
  never derive it. **See Q1 — this is the one inference we would like confirmed.**
- `obligatoryExtrasPrice` is additive to `price`, and its line items are per-period totals
  already multiplied by the `passengersOnBoard` we send. The catalogue extras on `/yachts`
  are unit prices with a `unit` field; the two must not be confused. `passengersOnBoard`
  defaults to 2 when omitted, not to the berth count.
- `price == 0` on `/prices` means no price list covers the period; `/offers` omits those
  rows entirely and returned zero in 0 of 6,275 offers. We drop them.
- `/prices` and `/offers` never disagreed on an amount in ~70 matched comparisons. We quote
  only from `/offers`.
- Reservation status 3 still holds the boat: five status-3 periods, none sellable via
  `/offers`, with a clean control on one yacht across three adjacent weeks.
- Duplicate occupied periods are two genuinely distinct reservations — `id` differed in
  3,641 of 3,641 duplicate groups. We merge by overlap and key on `id`.
- `defaultCheckInDay` is 1 = Sunday through 7 = Saturday, not ISO. Yachts with 7 start on
  Saturday in 200 of 200 real rows; and for two companies with `defaultCheckInDay = 6`,
  `/offers` returns ten offers for a Friday start and zero for Saturday or Thursday.
- `allCheckInDays`, `minimumCharterDuration` and `maximumCharterDuration` are authoritative
  and enforced by `/offers`, so flexible and short charters are discoverable after all. We
  withdraw our earlier statement that we could not see them.
- One-way charters are visible read-only: `baseFromId`/`baseToId` differ on 4.2% of
  availability rows and 15.5% of offers in one week, and `/offers` honours them as filters.
- An `/offers` response carries no validity, TTL or quote id, and `paymentPlan[0].date`
  tracks the request instant to the second. We treat an offer as a stateless recomputed
  quote and enforce any firmness ourselves.
- On a reservation, `clientPrice` is what the guest pays and `finalPrice` is what we owe
  you: measured on one charter, `basePrice` 4000.00, `clientPrice` 4500.00 (base plus the
  500.00 non-`payableInBase` APA), `commission` 600.00, `finalPrice` 3900.00 =
  `clientPrice − commission`. We invoice the guest `clientPrice`.
- `equipmentRaw[].id` and `/equipment` ids are separate id spaces: 0 of 42 raw ids appear
  in `/equipment`. We join by name only, and use `equipment[].id` for canonical amenities.

---

## 3. Questions we still cannot answer

### 3.1 Pricing

**Q1. Is `commissionValue` computed on the VAT-exclusive base?** Our reading above is
inference from a ratio pattern, not something the payload states. If it is right, please
confirm; if the divisor is something other than VAT, please say what. Related: is `price`
always VAT-inclusive, and does that vary by operator or country?

**Q2. Is `maxDiscountFromCommissionPercentage` enforced by the API, or by agreement?** We
read 10.0 for company 225 and see values from 8.0 to 25.0 across the account, but we
cannot test enforcement without submitting a discount.

**Q3. Security deposit: who collects it and how** — card imprint at the base, transfer, or
insurance waiver? `securityDeposit` mirrors `/yachts.deposit` exactly, but no field
anywhere states a collection method. Relatedly, `depositWithWaiver` is 0.0 on all 11 test
yachts and we found no waiver, damage-insurance or deposit product among the account's 16
extras. Is a deposit-waiver product exposed anywhere, and can 0.0 be distinguished from
"not offered"?

**Q4. Agency payment plan.** `paymentPlan` is `[{date, amount}]` — two fields, no payee, no
instalment type, no party — and it sums to gross `price` rather than to
`price − commissionValue`. Nothing in it distinguishes what we owe the charter from what
the guest owes us. Your article on payment plans says the agent's own plan appears only
after `confirmReservation`. Can an agency payment plan be configured per agency rather
than per booking, and read before confirmation?

### 3.2 Availability

**Q5. What is reservation status 11?** It is not in the specification. We see 387 rows in
2026 and 119 in 2027, mostly one-day periods, 364 of them from a single company whose
yachts carry `defaultCheckInDay = -1`, and it co-occurs with status 4 in duplicate groups.
We treat it and any other undocumented value as blocking the boat. Is the enum otherwise
open, and are there further values we have not sampled?

**Q6. Is there any supported way to hold a quoted price** short of creating an option?

### 3.3 Booking lifecycle

We ran five options and one confirmation on company 225 on 2026-08-20. All five options were
cancelled and verified released. **One confirmed reservation remains and we cannot remove it
— please delete it for us:**

> Charter-side id `8178244520000100225`, code `27-00008`
> Agency-side id `8178244250000107113`, code `27-00009`
> Whisper (`978990780000100225`), 2027-05-15 17:00 → 2027-05-22 09:00, status 1,
> clientName "Probe Foxtrot", clientPrice 4500.00 EUR.

Every cancel path we tried returns `400 Reservation already confirmed.`

A structural note that reframes several of the questions below: every reservation exists as
**two records** — a charter-side one whose id ends in the charter company's id, and an
agency-side twin ending in ours, linked by `charterReservationId`. `POST` answers with the
charter-side record; `PUT` and `DELETE` always answer with the agency-side one. The two carry
**different `reservationCode`s**, and codes collide across sides: our option was charter
`27-00005` / agency `27-00006`, while the very next option was charter `27-00006`. We now key
on the charter-side `id` and never on `reservationCode`. Please confirm that is right.

**Q7. Cancelling a confirmed booking.** `DELETE /reservation/{id}` returns `400 Reservation
already confirmed.`, and so does the agency-side id, `?force=true`, and `PUT {status: 5}`.
`POST /reservation/{id}/cancel` is a 404. What is the supported path, what are the deadlines
and penalties, and who may initiate it? No cancellation-policy field appears anywhere on the
reservation, offer or yacht payloads.

**Q8. Is `PUT /reservation/{id}` really "confirm", and is there any amendment path?** We sent a
`PUT` carrying new dates, a new guest count, a new `clientName` and `status: 2`. Every field
was ignored and the option was flipped to `status 1` — a confirmation. We can find no way to
amend a reservation through the API. Is that correct?

**Q9. Is `myReservationId` an input or an output?** We send it on create; it is accepted with a
201 but never echoed or stored. `GET /offers?...&showOptions=true` then returns
`myReservationId` set to _your_ agency-side reservation id, not the value we sent. Read that
way it means "an option of mine already exists here", which is useful — but it is not an
idempotency key, and the specification reads as though we may set it. Which is intended?

**Q10. Is there any idempotency mechanism for `POST /reservation`?** This is our largest
remaining risk: if a create times out we cannot tell whether it succeeded without risking a
double booking. We measured:

- Re-submitting with the _same_ `myReservationId` → `400 Yacht is not available, own Option
exists.` Good — but re-submitting with a _different_ value for the same yacht and period
  gives the identical 400, so the refusal is an availability check, not value-based dedup.
- Submitting with **no** `myReservationId`, same yacht and period, same minute → **201**, with
  **`status 9`** (undocumented), no `expirationDate`, and the record invisible in both
  `/reservations/{year}` and `/availability/{year}`. It blocks nothing. So the same slot can be
  submitted twice and leave a second, orphaned record behind.
- An `Idempotency-Key` header is accepted, never echoed, and has no effect.

Can you offer a true idempotency key? Failing that, please confirm what `status 9` is and what
we should do with such records.

**Q11. Client and crew data.** Omitting `clientName` entirely still returns 201, with the vendor
substituting our own API user as the client. A nested `client` object, `clientEmail`,
`clientPhone`, `skipperLicense`, `skipperName` and `remarks` were all silently dropped, and
`/clients`, `/client/{id}` and `/crew` are 404s. Whisper carries `requiredSkipperLicense: 1`,
yet both the create and the confirm succeeded with no licence data at all. We take it that
`crewListLink` on the reservation is the intended channel for crew, licences and passenger
details, and that `clientName` is the only client field the API accepts. Please confirm — and
if a licence is required before departure, confirm that verification sits with the base rather
than with us.

**Q12. Optional extras.** Sending an `extras` array on create returned 201 with the items absent
and `clientPrice` unchanged; the six obligatory extras were created and nothing else. We
conclude optional extras cannot be attached through the API and must be agreed with the base
directly. Correct?

**Q13. Please document `agencyPaymentPlan`.** It answers our earlier payment-plan question and it
is not in the specification. For one charter we read three different plans:
`/offers.paymentPlan` (2 × 2000.00, covering `price` only), the charter-side record's
`paymentPlan` (2 × 2250.00, the guest schedule including the APA), and the charter-side
record's `agencyPaymentPlan` (2 × 1950.00 = `clientPrice − commission`, our obligation to you).
The agency-side twin carries `agencyPaymentPlan: null` and a second due date two days earlier
than the charter side. We now read `agencyPaymentPlan` as what we owe you and `paymentPlan` as
what the guest owes us. Is that right, and is the two-day gap deliberate?

**Q14. Option expiry is a deadline, not a duration.** `expirationDate` was always populated on
`status 2` and always landed at 11:59 on a later day, carrying the creation seconds: 7 calendar
days out for charters ~8 months away, 3 days out for a charter 16 days away, with no variation
between yachts at equal proximity. Other companies' rows show 23:59, 15:59 and 17:59, so we
assume 11:59 is a per-charter-company deadline time. What decides the number of days, and is
the deadline time configurable per operator? We read `expirationDate` and never compute it, so
this is for forecasting rather than correctness.

### 3.4 Object search and delta sync

**Q15. Can object-level read on `Resource` be granted to an agency key?**
`POST /objects/{entity}/search/` returns rows for `User` (5-6) and `Reservation` (102).
`Resource` returns `objects: []` with `total_count: 24,822`, and `Base` and `Payment`
behave the same way. We have ruled out paging (body-level `page`/`per_page` are honoured;
`page: 2` on Reservation correctly returns 0) and field projection (`fields` is rejected,
`columns` ignored). Filters demonstrably work on `User` — `DISABLED=false` returns 6 rows,
`DISABLED=true` returns 0 — so we read the empty array as a permission boundary. Note
`Service` now returns `422 No index found for class:null`, and `Company` returns
`400 Bad request` for every body shape we tried.

**Q16. Is `lastSyncPoint` supported, and will it stay supported?** We have it working on
`Reservation`: the response carries a top-level `syncpoint`, and feeding it back as a query
parameter (not in the body, where it is ignored) correctly narrowed a later call to the one
reservation that had changed. Values only ever increased and repeated calls were stable.
Since none of this is in the specification we would like to know: is it supported for
integrator use, is the value guaranteed monotonic per key, how long is a given value
honoured, and does it cover deletions? We see no deleted or modified marker on returned
rows, only business statuses.

**Q17. Is there a changed-since parameter for the catalogue?** `lastSyncPoint` is silently
ignored on `/yachts`, `/companies`, `/prices` and `/offers`, so we still walk 1,308
companies nightly. This remains our largest cost.

### 3.5 Operational

**Q18. What sustained request rate is acceptable?** No limit is documented and no
`X-RateLimit-*` or `Retry-After` header is returned. We measured a ~0.35 s median catalogue
read, ten concurrent reads on one key completing at baseline latency with no per-key
serialisation, and a 32-second 55 MB `/availability` read that did not block concurrent
requests on the same credential. We withdraw the concern in our last message that a sync
starves live quotes — we could not reproduce it against you. What we still need is the
ceiling: what sustained call volume is acceptable, at what point do we see a 429, and do
you recommend separate credentials for bulk sync and live customer quotes?

**Q19. Is there any push mechanism (webhooks)** for price, availability, option or
cancellation changes, or should we poll?

**Q20. Are write-side errors machine-distinguishable?** On the read side they are not: every
non-2xx body is either an HTML error page or a bare English sentence, and the 422 and 401
are sent with `content-type: application/json` but a payload that is not JSON. We need to
tell "the slot was just taken" and "the price changed", which we show the customer, from
"your payload is wrong", which we fix. Is there a documented list of error codes for
`POST /reservation` and `confirmReservation`, or a machine-readable field we can branch on?

**Q21. Is `inventory=raw` supported and stable?** It is our only source of equipment category
names. We have established that it adds exactly one key (`equipmentRaw`) and that
`inventory=zzz` adds nothing, so the parameter is validated by value. We just need to know
we can rely on it.

**Q22. Fleet scope and key permissions.** `/companies` returns 1,308 and we can read yachts
for essentially all of them, with a commission quoted everywhere. No field on either the
company or the yacht object distinguishes "contracted and sellable" from "merely visible".
Are all 1,308 sellable under our agency agreement, or is it a contracted subset? Is there
a per-company or per-yacht flag we should be reading? And which operations is our key
permitted to perform: create options, confirm bookings, access invoices, manage clients?

**Q23. How is deactivation signalled?** We found no `disabled`, `active`, `status` or
`deleted` field on any of 1,308 company objects or 300+ yacht objects, and a removed yacht
returns `Entity not found`. `DISABLED` exists and is queryable on `User` only. Today we
deactivate anything a sync run does not return, which makes us fragile to a partial
failure. Is disappearance the intended signal, or can a flag be exposed?

**Q24. Physical identifier.** `certificate` does carry a real registration where present
(`EL-PIRAEUS-11274`, `HR-…`, unique in all 42 cases we found), but coverage is about 16%
platform-wide and 0% on company 225. There is no MMSI, IMO, HIN or hull field anywhere.
The same boat appears in your system and another provider's, and without a physical
identifier our deduplication stays fuzzy and human-reviewed. Is `certificate` coverage
something operators can be asked to complete, or is there another identifier we have missed?

**Q25. May we cache your images** and serve transformed versions through our own pipeline, or
must we hotlink? Please point us at the governing terms.

**Q26. Retention and data processing.** What are your terms for the client and crew data we
submit, and who is responsible for issuing the invoice to the end client?

**Q27. The beta host is not isolated.** `https://beta.booking-manager.com/api/v2` exists with
a valid wildcard certificate (so the plain-HTTP address in your documentation appears to be
out of date). But our production key authenticates against it, and it returns the same 11
yachts and the same 113 availability rows with identical reservation ids as production —
it reads the same database. `OPTIONS /reservation` there returns `Allow: POST`. Is that
intended? If beta is meant to be a sandbox it is not behaving as one, and we would rather
know before running test bookings against it. Failing that: should test bookings run
against production company 225, do they notify a real operator, and how should we clean
them up?

Happy to take any of this on a call if that is faster than writing it out.

Best regards,
Daria
