# Price weeks: Sunday and Wednesday check-ins

Прогрес: 7 з 7

| #   | Step                                    | State                                                |
| --- | --------------------------------------- | ---------------------------------------------------- |
| 1   | Measure eligibility on the local DB     | done, numbers below                                  |
| 2   | Implement the weekday period list       | done                                                 |
| 3   | Refusal semantics unchanged             | done, the writer's own rule test already carries it  |
| 4   | Weekdays as config                      | done, `PRICE_WEEKS_WEEKDAYS`                         |
| 5   | Unit tests                              | done, 32 in price-weeks.test.ts plus hullsEligibleOn |
| 6   | Cost estimate in docs/scheduled-jobs.md | done                                                 |
| 7   | Local trial against the live vendors    | done, timings below                                  |

## 1. Eligibility, local catalogue, 2026-09-18

Active offers of active provider records with a published listing and an external hull id,
counted for a seven-night charter. The rule test is the one `replaceRefusedPeriods` applies:
check-in weekday (or none), min and max nights, season in force on the check-in date.

Ignoring seasons, so the ceiling:

| Provider        | Saturday | Sunday | Wednesday |
| --------------- | -------- | ------ | --------- |
| NauSYS          | 7,384    | 1,903  | 2,239     |
| Booking Manager | 10,645   | 3,359  | 3,353     |

Distinct hulls actually eligible over the seven weeks 2026-09-19 to 2026-11-04, seasons applied:

| Provider        | Saturday | Sunday        | Wednesday     |
| --------------- | -------- | ------------- | ------------- |
| NauSYS          | 7,348    | 1,149 (15.6%) | 1,399 (19.0%) |
| Booking Manager | 10,645   | 3,359 (31.6%) | 3,353 (31.5%) |

Offer-weeks with no vendor price for that exact charter (no `availability_slot` that is
available, dated to the day and carrying `price_minor`), same seven weeks:

| Provider        | Weekday   | Offer-weeks | Unpriced | Share |
| --------------- | --------- | ----------- | -------- | ----- |
| NauSYS          | Saturday  | 51,434      | 30,118   | 58.6% |
| NauSYS          | Sunday    | 7,526       | 7,505    | 99.7% |
| NauSYS          | Wednesday | 9,220       | 9,157    | 99.3% |
| Booking Manager | Saturday  | 74,515      | 42,825   | 57.5% |
| Booking Manager | Sunday    | 23,513      | 15,233   | 64.8% |
| Booking Manager | Wednesday | 23,471      | 16,673   | 71.0% |

Only 94 NauSYS offers and no Booking Manager offer publish no check-in rule at all, so
eligibility here is the operators' own rules rather than a default.

## 2 to 6. What changed

- `packages/db/src/search/checkin-weekdays.ts` (new): `listWeekdayCharterHulls`, the hulls whose
  rules admit a seven-night charter on one weekday, with the season each rule is in force for,
  and `hullsEligibleOn`, which picks the ones covering a given check-in. Re-exported from
  `search/read-model.ts`. No migration: it reads `listing_checkin_rule` as it stands.
- `packages/providers/src/shared/price-weeks.ts`: `weekdayWeeks` generalises `saturdayWeeks`, and
  `priceWeekPeriods` builds the whole list -- Saturdays unrestricted, then each further weekday
  carrying its own `SweepPeriod.yachtIds`, with an empty weekday-week dropped. `remainingWeeks`
  now resumes by weekday group as well as by date.
- `apps/server/src/sync-price-weeks.ts`: reads the eligible hulls once per weekday per provider
  and builds the list from them.
- `packages/env/src/server.ts` and `apps/server/.env.example`: `PRICE_WEEKS_WEEKDAYS`, default
  `6,0,3`, validated as distinct weekdays in 0 to 6. `PRICE_WEEKS_COUNT` and
  `PRICE_WEEKS_BUDGET_MS` untouched.
- Refusal semantics are unchanged and needed no code: `replaceRefusedPeriods` already refuses
  only a hull whose own check-in rules admit that weekday and length in that season. NauSYS
  additionally narrows the judged set to the hulls it asked about, through the
  `swept.externalYachtIds` the stream already carried.

## 7. Trial, 2 weeks per weekday, live vendors, read-only price queries

No options and no bookings were placed; the job issues `freeYachts` and `/offers` only.

| Provider        | Periods | Wall clock | Prices written | Refusals | Listings rebuilt |
| --------------- | ------- | ---------- | -------------- | -------- | ---------------- |
| Booking Manager | 6       | 47 s       | 10,270         | 1,105    | 4,502            |
| NauSYS          | 6       | 125 s      | 3,478          | 184      | 1,565            |

Per weekday, fetch and write:

| Provider        | Weekday   | Fetch         | Write       | Offers returned |
| --------------- | --------- | ------------- | ----------- | --------------- |
| NauSYS          | Saturday  | 26.1 / 66.6 s | 1.2 / 1.8 s | 819 / 1,340     |
| NauSYS          | Sunday    | 3.9 / 4.6 s   | 0.5 / 0.4 s | 306 / 324       |
| NauSYS          | Wednesday | 9.2 / 7.2 s   | 0.4 / 0.5 s | 344 / 382       |
| Booking Manager | Saturday  | 1.4 / 0.0 s   | 3.9 / 5.0 s | 2,706 / 3,995   |
| Booking Manager | Sunday    | 0.0 s         | 1.1 / 1.2 s | 773 / 1,020     |
| Booking Manager | Wednesday | 0.0 s         | 1.1 / 1.4 s | 931 / 1,262     |

Rows written for the new weekdays, over the two trial weeks:

| Provider        | Weekday   | Prices | Refusals |
| --------------- | --------- | ------ | -------- |
| NauSYS          | Sunday    | 630    | 19       |
| NauSYS          | Wednesday | 729    | 12       |
| Booking Manager | Sunday    | 2,122  | 3,355    |
| Booking Manager | Wednesday | 2,335  | 281      |

The cost extrapolation and the production settings recommended from it are in
`docs/scheduled-jobs.md`, under "What Sunday and Wednesday add".
