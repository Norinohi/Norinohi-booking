# Booking Manager: questions for MMK

One consolidated list, ready to send. It merges the Booking Manager items from
[`open-questions-and-decisions.md`](./open-questions-and-decisions.md) §3, the
open questions in [`booking-manager-api-backend-map.md`](./booking-manager-api-backend-map.md) §9,
and every `Q-BM-*` marker left in `packages/providers/src/booking-manager/`.

**Each question states the assumption the connector currently ships with**, so a
short confirm or correct is enough. Where we were wrong, the fix is named, and in
every case it is one function.

Ordered by what it costs us to be wrong.

## Already answered, do not re-ask

- **Date and time semantics** (support@mmksystems.com, Aug 2026): fixed CET
  observing DST; `yyyy-MM-ddTHH:mm:ss` with mandatory seconds outbound, space
  separated inbound, no offset suffix either way; no per-base timezone exposed;
  `/offers` takes `00:00:00` and the vendor substitutes the base's real
  check-in/check-out.
- **Sync shape and `/prices` semantics**, from the "How to start the RESTful web
  service integration" article: `/companies` then per-company `/yachts`;
  `/prices` called once per Saturday-to-Saturday pair; omitting `yachtId` returns
  the whole fleet. This also settled that a row prices the period requested.

## A. Money: being wrong here charges the customer the wrong amount

1. **Which field is the customer's price?** An offer carries `price`,
   `startPrice`, `commissionPercentage`, `commissionValue`, `discountPercentage`;
   a reservation carries `basePrice`, `discount`, `commission`, `finalPrice`,
   `clientPrice`.
   _We assume:_ the customer pays `price`, and `commissionValue` is our margin
   sitting inside it, neither added nor subtracted.
   _Please confirm_ which field is the amount payable by the end client, where
   the agency commission sits, and how `finalPrice` differs from `clientPrice`.

2. **Is `obligatoryExtrasPrice` additive to `price`, or already inside it?**
   _We assume:_ additive, so total = `price` + obligatory extras. The connector
   currently refuses to quote when the individual extras do not sum exactly to
   `obligatoryExtrasPrice`, rather than risk mispricing.
   _Please confirm_, and say whether the two are ever expected to disagree
   (rounding at the total rather than per line, or an extra not itemised).

3. **Is an extra's `price` a line total or a unit price?** The payload has `unit`
   but no quantity.
   _We assume:_ line total. If it is per unit we under-charge.

4. **VAT and currency.** Are returned prices VAT inclusive, and does that vary by
   operator or country? When we pass `currency`, is the conversion yours and at
   what rate, or must we convert?

5. **Agency discounts.** `maxDiscountFromCommissionPercentage` appears on a
   company. What discount are we permitted to grant from our commission, and is
   it enforced by the API or by agreement?

## B. Availability: being wrong here oversells a boat

6. **Is `dateTo` the exclusive check-out day, or the inclusive last day?**
   (`Q-BM-DATETO`)
   _We assume:_ exclusive, so a Saturday-to-Saturday booking is
   `dateFrom=Sat, dateTo=next Sat`. If it is inclusive, every occupied period we
   store is one night short, which is exactly the case that oversells a
   turnaround day.

7. **Is the reservation `status` enum closed at 4?** (`Q-BM-STATUS`) Documented:
   1 Reservation, 2 Option, 3 Option in expiration, 4 Service.
   _We assume:_ all four occupy the boat; 4 is a maintenance or delivery block
   and never a sale; anything undocumented is treated as blocked so it cannot
   oversell.
   _Please confirm_ the meaning of 3 in particular: is the option still holding
   the week, or has it lapsed and the boat is bookable again?

8. **Can a period legitimately start and end on the same day?** We now read that
   as a one day block. Previously it was rejected, which would have failed a
   whole company-year import.

9. **Availability guarantee.** When `/offers` returns a boat at a price, is that
   price and slot firm for any period? Does creating an option lock both?

## C. Booking lifecycle

10. **Is `PUT /reservation/{id}` a replace or a patch?** (`Q-BM-PUT`)
    _We assume:_ a full replace, so we resend the whole body with `status: 1`
    rather than only `{status}`, on the theory that a partial body might clear
    the fields we omit. Confirming lets us send the smaller, safer request.

11. **How is a new end client created?** (`Q-BM-CLIENT`) We currently send only
    `clientName` and omit `clientId`. Is there a supported way to create or look
    up a client through the API, and which client and crew fields are mandatory
    for a confirmed booking?

12. **Option expiry.** How long is a hold granted for, is the duration per
    operator, and is `expirationDate` always populated on create? We release our
    hold 15 minutes before your expiry so we never sell a slot you already
    dropped.

13. **Cancellation.** `DELETE /reservation/{id}` is documented as cancelling
    options only. What is the supported path for cancelling a confirmed booking,
    what are the deadlines and penalties, and who may initiate it?

14. **Do reservation dates also take `00:00:00`?** Confirmed for `/offers`; we
    assume the same substitution applies to `POST /reservation`.

15. **One-way charters.** We currently set `baseFromId` and `baseToId` to the
    listing's home base. What is the correct way to book a one-way, and are
    `oneWayPeriods` or equivalent exposed?

## D. Operational

16. **Rate limits.** None documented. We self-throttle to one request at a time
    with 250 ms between calls. Is that comfortable, too conservative, or not
    enough? A full price sweep is 52 calls per year synced.

17. **Delta sync.** Does `/yachts` (or any catalogue endpoint) support a
    "changed since" parameter, or is a full dump the only option? This decides
    whether our catalogue sync can ever be incremental.

18. **Array query parameters.** Repeat key (`?yachtId=1&yachtId=2`) or comma
    joined (`?yachtId=1,2`)? _We assume:_ repeat key.

19. **`/countries` field names.** The Swagger declares `short` and `long`; the
    worked example in your integration guide returns `shortName` and `longName`.
    Which is current? We accept both, but one of the two documents is stale and
    worth correcting for the next integrator.

20. **Webhooks.** Any push mechanism for changes to price, availability, options
    or cancellations, or should we poll?

21. **`inventory=raw` on `/yachts`.** We pass it to get `equipmentRaw`, which is
    our only source of equipment category names. Is it supported and stable, and
    do `equipmentRaw[].id` values share an id space with `/equipment`?
    (`Q-BM-EQUIPMENT-ID`)

22. **`defaultCheckInDay` numbering.** (`Q-BM-CHECKIN-DAY`) _We assume:_ ISO
    1 = Monday through 7 = Sunday, and that check-out falls on the same weekday.

## E. Data, matching and commercial

23. **Stable cross-provider identifiers.** The same yacht can appear in both your
    system and another provider's. Do you expose a hull number, MMSI, IMO or
    registration we can match on? Without one, deduplication stays fuzzy and
    needs human review, and we would rather not show the same boat twice.

24. **Media rights.** May we cache your images and serve transformed versions
    through our own image pipeline (Cloudinary), or must we hotlink? Please point
    us at the governing terms. This matters to us because your photos are
    generally the better set when a boat appears in two systems.

25. **Customer data and GDPR.** What are your retention and data-processing terms
    for client and crew data we submit, and who is responsible for generating the
    invoice?

26. **Agency permissions.** With our agency credentials, which operations are we
    permitted to perform: create options, confirm bookings, add extras, access
    invoices, manage clients? Any read-only restrictions we should design around?

## F. Access

27. **Trial timing.** The connector is built and tested against the specification;
    what remains is verification against real data. We would like the one month
    trial, with the demo fleet for test bookings, to start when we can use all of
    it. What lead time do you need from our confirmation of the commercial
    proposal and terms?

28. **Key issuance.** We understand the key is generated at
    **My Account > API Integration** on the portal. Is that available to us
    directly once the proposal is accepted, or is it issued by your side?
