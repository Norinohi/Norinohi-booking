Subject: Re: Booking Manager REST API, integration status from Norinohi

Dear Diego,

Thank you, and thank you for the detailed answers of 25 August. They are all in the
connector now: we cap ourselves at 20 concurrent calls per account with a reserve kept free
for live guest quotes, we warm the six servers before a sweep, we hold your full status list
0 to 11, we take a percentage extra on the charter price alone, we treat disappearance from
`/companies` or `/yachts` as deactivation, and we poll rather than expect a push. We have
stopped pursuing `/objects/{entity}/search/` and continue the nightly walk of all companies,
as you recommend.

The integration works. Running against charter test company 225, catalogue sync,
availability, quoting from `/offers` including obligatory extras, and the lifecycle from
option to confirmation are all built and green.

One thing is still open, and one small follow-up:

**Idempotency on `POST /reservation`.** We found no idempotency key, so a create that times
out cannot be told from one that succeeded, and a blind retry risks a double booking.
Re-submitting with the same `myReservationId` is refused, but so is the same yacht and period
with a different value, so the refusal is an availability check rather than value-based
deduplication, and a submission with no `myReservationId` at all returns 201 a second time.
`GET /offers?showOptions=true` does let us see afterwards that an option of ours exists on
that yacht and period, which is the recovery we use today, but it is keyed on the slot rather
than on our request and it says nothing about a create that confirms straight away. Is there
a supported mechanism we have missed, or is `myReservationId` meant to serve as one? This is
our largest remaining risk before we go live.

**For our nightly reconciliation:** once a confirmed reservation is cancelled out of band by
the charter company, does `GET /reservation/{id}` then report status 5, so we can see the
cancellation without being told?

Best regards
