/**
 * Confirmed Booking Manager slots stored under dates the vendor never offered.
 *
 * Before `coversAskedDays` in ../../booking-manager/confirmed-offers.ts, an `/offers` row was keyed
 * to the period we asked about whatever dates it carried. Asked for one night, the vendor also
 * answers with a `DailyCharter` out and back the same day, so a day trip was stored as a
 * one-night charter: a card in search that the detail page then refused. The fixed fold drops
 * such rows, but a slot already written stays until something removes it.
 *
 * This re-asks `/offers` once per stored period, account-wide as the sweep does, and flags a slot
 * where the vendor answered for the yacht yet no offer covers the stored dates. A yacht absent
 * from the answer is left alone: booked since, or out of scope, and the sweep owns that verdict.
 *
 * Read-only at the vendor. Without `--apply` it writes nothing; with it, it deletes the flagged
 * slots and rebuilds the search documents of the listings they belonged to.
 *
 *   pnpm --filter @yacht-charter/providers audit:bm-mismatched-offers
 *   pnpm --filter @yacht-charter/providers audit:bm-mismatched-offers -- --apply
 */
import { parseArgs } from "node:util";

import { db } from "@yacht-charter/db";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { sql } from "drizzle-orm";

import { BookingManagerClient } from "../../booking-manager/client";
import { resolveBookingManagerConfig } from "../../booking-manager/config";
import { foldOffersToConfirmed } from "../../booking-manager/confirmed-offers";
import { formatBookingManagerDateTime } from "../../booking-manager/dates";
import { bookingManagerEndpoints, restOfferListSchema } from "../../booking-manager/endpoints";

const { values: args } = parseArgs({
  /* pnpm forwards the `--` that separates its own flags, which parseArgs reads as a terminator. */
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    apply: { type: "boolean", default: false },
  },
});

const DAY_MS = 86_400_000;
const DELETE_CHUNK = 1_000;

type StoredSlot = {
  id: string;
  listingId: string;
  yachtId: string;
  startDate: string;
  endDate: string;
};

const { rows: slots } = await db.execute<StoredSlot>(sql`
  select
    s.id,
    s.listing_id as "listingId",
    ls.external_yacht_id as "yachtId",
    s.start_date::text as "startDate",
    s.end_date::text as "endDate"
  from availability_slot s
  join listing_offer o on o.id = s.listing_offer_id
  join listing_source ls on ls.id = o.listing_source_id
  join provider_record pr on pr.id = ls.provider_record_id
  join provider p on p.id = pr.provider_id
  where p.code = 'booking_manager'
    and s.availability_confirmed
    and s.status = 'available'
    and s.price_minor is not null
    and s.start_date > current_date
`);

const byPeriod = new Map<string, StoredSlot[]>();
for (const slot of slots) {
  const key = `${slot.startDate}|${slot.endDate}`;
  byPeriod.set(key, [...(byPeriod.get(key) ?? []), slot]);
}

console.log(`${slots.length} confirmed slots across ${byPeriod.size} periods`);

const client = new BookingManagerClient({ config: resolveBookingManagerConfig() });
const flagged: StoredSlot[] = [];
const byLength = new Map<number, { slots: number; flagged: number }>();
let asked = 0;

for (const [key, periodSlots] of byPeriod) {
  const [startDate = "", endDate = ""] = key.split("|");
  const offers = await client.get(bookingManagerEndpoints.offers, restOfferListSchema, {
    dateFrom: formatBookingManagerDateTime(startDate),
    dateTo: formatBookingManagerDateTime(endDate),
  });

  const answered = new Set(offers.map((offer) => String(offer.yachtId)));
  const covered = new Set(
    foldOffersToConfirmed(offers, startDate, endDate).map((offer) => offer.externalYachtId),
  );

  const nights = (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS;
  const tally = byLength.get(nights) ?? { slots: 0, flagged: 0 };
  for (const slot of periodSlots) {
    tally.slots += 1;
    if (answered.has(slot.yachtId) && !covered.has(slot.yachtId)) {
      flagged.push(slot);
      tally.flagged += 1;
    }
  }
  byLength.set(nights, tally);

  asked += 1;
  if (asked % 20 === 0) console.log(`${asked}/${byPeriod.size} periods, ${flagged.length} flagged`);
}

console.log("\nnights  slots  flagged");
for (const [nights, tally] of [...byLength].sort(([a], [b]) => a - b)) {
  console.log(
    `${String(nights).padStart(6)} ${String(tally.slots).padStart(6)} ${String(tally.flagged).padStart(8)}`,
  );
}

const listingIds = [...new Set(flagged.map((slot) => slot.listingId))];
console.log(`\n${flagged.length} slots flagged on ${listingIds.length} listings`);

if (!args.apply) {
  console.log("Dry run. Re-run with --apply to delete them.");
  process.exit(0);
}

if (flagged.length > 0) {
  const ids = flagged.map((slot) => slot.id);
  for (let at = 0; at < ids.length; at += DELETE_CHUNK) {
    await db.execute(
      sql`delete from availability_slot where id in ${ids.slice(at, at + DELETE_CHUNK)}`,
    );
  }
  await rebuildSearchReadModelsAfterSync(db, { listingIds });
  console.log(`Deleted ${ids.length} slots and rebuilt ${listingIds.length} search documents.`);
}

process.exit(0);
