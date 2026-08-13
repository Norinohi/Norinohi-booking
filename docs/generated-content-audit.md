# Content we generate rather than source

An audit of everything the catalogue presents as fact without a provider behind it, taken
2026-08-13 against the NauSYS fleet of 109 listings.

Several entries turn on "NauSYS does not publish this". **Booking Manager publishes some of
them**, so re-run this list once the second connector lands: a field that is unknowable from one
provider may simply be missing a mapping for the other. The right-hand column says what to check.

## Open — decide when the second provider is in

### 1. The "Suggested route" section is entirely invented

`suggestedRouteFor` in `packages/db/src/search/repository.ts`.

Every listing gets a 7-day itinerary that is generated, not sourced:

- **Coordinates are fabricated.** Each stop is the base's `lat`/`lng` plus a fixed offset, so
  "Hvar" is not Hvar — it is the marina shifted by `-0.18, +0.15`.
- **Only Dalmatia has named stops.** Everything else falls through to "Island bay", "Old town",
  "Quiet cove", "Marina approach". That is **90 of 109** listings: Kvarner (31), Istra (18),
  Zadar (12), Dubrovnik (6) and the rest never match the `region.includes("dalmatia")` test.
- It renders with a map, as trip guidance.

This is the most serious one: invented advice about where to sail, at invented positions.

**Neither provider supplies itineraries.** This is editorial content or it is nothing. Options are
an empty state, a hand-written route per region, or dropping the section. Not a mapping problem.

### 2. Payment methods are identical for every operator

`paymentMethodsAcceptedByCharterCompany: ["card", "bank_transfer", "cash"]`, hardcoded, rendered
under one named operator's heading.

**Check Booking Manager.** Neither its yacht record nor NauSYS's carries a payment-methods field
today, so this may stay unsourceable — in which case the honest fix is to drop the block rather
than keep asserting a policy on the operator's behalf.

### 3. Pickup and drop-off dates are the availability window

`yachtPickup.date` / `yachtDropOff.date` are `available_from` / `available_to`: the first and last
dates the boat is free anywhere in the horizon, presented as this charter's pickup and drop-off.

The **times** beside them are real (`base.check_in_time` / `check_out_time`, all 26 bases). Only
the dates are wrong, and they are wrong by category rather than by data — a listing page has no
charter yet. Either show the times alone, or move the block behind a selected period.

## Resolved on 2026-08-13

Kept here so the second connector is measured against the same list.

| what | was | now |
| --- | --- | --- |
| Card charter dates | one hardcoded July week on every card, every search | the searched dates |
| Card charter times | hardcoded `Europe/Zagreb` 17:00/09:00 | each base's own times, 6 bases differ |
| Crew filter | `crew_type` null on all 109, filter always empty | `charterType` + `crewedCharterType`: 97/7/5 |
| Mainsail filter | `sail_type` null on all 109 | `sailTypeId` resolved: 42/41/3/1 |
| Card "from" price | cheapest enumerated week, absent on 8 listings | cheapest published rate, all 109 |
| Price caption | "Price for 3 days" over a weekly rate | names the rate's own period |
| Duration filter | selected nothing | filters on `listing_checkin_rule` |
| Availability | synthesized charters (ADR 0004) | occupancy complement + published rates |
| Pets | "Pets are not permitted" asserted on all 109 | points at the base, which decides |
| Card prepayment | hardcoded 25% against a 50% default | the marketplace default itself |
| Booked/viewed counts | `stableCount`, derived from the slug | counted from `booking` and `listing_view` |

## Still unsourceable from NauSYS

Not invented — absent, and correctly showing as absent. Re-check each against Booking Manager.

| field | NauSYS | Booking Manager | note |
| --- | --- | --- | --- |
| `pets_allowed` | no field | not seen in the yacht record | false for all 109; copy no longer claims a ban |
| `deposit_insurance_included` | only `depositWhenInsured`, an amount | unknown | false for all 109; the toggle matches nothing |
| `max_nights` | never mapped by `checkinRulesOf` | `minimumCharterDuration` only | null on all 109; the calendar cannot cap a range |
| Daily rates | `DAILY` price lists exist for **2** of 109 | unknown | `listing_price_period.kind` is ready for them |
| Short-break product | `minimumShortPeriodDuration: 3` on **104** yachts, unmapped | unknown | see below |
| Base timezone | not published | not published | times are wall-clock text; do not convert |
| Seasonal check-in rules | `checkInPeriods` all span 1970–2099 | `defaultCheckInDay` is a single day | `listing_checkin_rule` has no validity period |

### The short-break question, worth asking the vendor

104 of the 109 Saturday-to-Saturday yachts also advertise `minimumShortPeriodDuration: 3`, which
`endpoints.ts` describes as "the floor for short-break offers, which is a different product from
`minimalReservationDuration`". We map none of it, so those boats appear week-only.

Unknown, and not answerable from the payloads:

- Does the Saturday check-in constraint still apply to a short break?
- Is it restricted to off-season, or to near-departure dates?
- Why do only 2 of 109 yachts have a DAILY price list when 104 advertise a short-period minimum?
  A weekly rate cannot price three nights, so without those lists the product is unsellable.

There is no NauSYS equivalent of `booking-manager-vendor-questions.md`. This is the first entry
for one.

## Fine as they are

Checked and deliberately left alone, so the next audit does not re-open them.

- `descriptionFor` / `overviewFor` — templated prose, but every value in it is real.
- `cancellationPaymentPolicies` — a disclaimer that explicitly says terms vary by selection.
- `sailingLicenseRequired` — derived from `crew_type`, which is now populated, so it is correct.
- `currency: "EUR"` across the routers — OpenAPI examples, not runtime values.
- `http://localhost:3000` in `orpc.ts` / `auth-client.ts` — last-resort fallback after the env and
  Vercel checks.
- `DETAIL_HREF = "/yachts/lagoon-42"` — only reached by a card with no id, i.e. Storybook samples.
