/**
 * Whether Booking Manager sells the check-in days a yacht lists, or only Saturday.
 *
 * `checkinRulesOf` in ../../booking-manager/projection.ts narrows every yacht that lists Saturday
 * among its check-in days to Saturday alone, on the grounds that `/offers` refused the other days.
 * The sweep has since stored tens of thousands of confirmed non-Saturday weeks for such yachts, so
 * this asks the vendor directly: for each sampled yacht, a Saturday week it has already priced,
 * and the weeks starting on the Monday, Wednesday and Friday after it, all inside one free stretch.
 *
 * Read-only at the vendor (`/offers`) and writes nothing to our database.
 *
 *   pnpm --filter @yacht-charter/providers audit:bm-checkin-days -- --yachts 40
 */
import { parseArgs } from "node:util";

import { db } from "@yacht-charter/db";
import { sql } from "drizzle-orm";

import { BookingManagerClient } from "../../booking-manager/client";
import { resolveBookingManagerConfig } from "../../booking-manager/config";
import { formatBookingManagerDateTime } from "../../booking-manager/dates";
import { bookingManagerEndpoints, restOfferListSchema } from "../../booking-manager/endpoints";

const { values: args } = parseArgs({
  /* pnpm forwards the `--` that separates its own flags, which parseArgs reads as a terminator. */
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    yachts: { type: "string", default: "40" },
    partial: { type: "string", default: "15" },
  },
});

const DAY_MS = 86_400_000;
/* JavaScript weekdays, which is also how `listing_checkin_rule` stores them. */
const WEEKDAYS = { Saturday: 6, Monday: 1, Wednesday: 3, Friday: 5 } as const;
const DAYS = ["Saturday", "Monday", "Wednesday", "Friday"] as const;
/* Booking Manager numbers 1 Sunday .. 7 Saturday; see `weekdayOf` in the projection. */
const bmDay = (weekday: number) => weekday + 1;

type Sample = {
  group: "any day" | "some days, Saturday among them";
  yachtId: string;
  listedDays: number[];
  freeFrom: string;
  freeTo: string;
};

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

async function samples(group: Sample["group"], limit: number): Promise<Sample[]> {
  const listed =
    group === "any day"
      ? sql`jsonb_array_length(rp.payload->'allCheckInDays') = 7`
      : sql`jsonb_array_length(rp.payload->'allCheckInDays') between 2 and 6
            and rp.payload->'allCheckInDays' @> '[7]'::jsonb`;

  const { rows } = await db.execute<{
    yachtId: string;
    listedDays: number[];
    freeFrom: string;
    freeTo: string;
  }>(sql`
    select distinct on (r.external_id)
      r.external_id as "yachtId",
      array(select jsonb_array_elements_text(rp.payload->'allCheckInDays')::int) as "listedDays",
      s.start_date::text as "freeFrom",
      f.end_date::text as "freeTo"
    from provider_record r
    join provider p on p.id = r.provider_id and p.code = 'booking_manager'
    join provider_raw_payload rp on rp.id = r.raw_payload_id
    join listing_source ls on ls.provider_record_id = r.id
    join listing_offer o on o.listing_source_id = ls.id and o.status = 'active'
    join listing l on l.id = o.listing_id and l.status = 'published'
    /*
     * A Saturday week the vendor has already priced, inside a stretch our occupancy calls free
     * for the fortnight after it. Without the priced week the sample drifted into seasons the
     * vendor sells nothing in at all, where every day reads as refused and the test says nothing.
     */
    join availability_slot s
      on s.listing_offer_id = o.id
     and s.availability_confirmed
     and s.status = 'available'
     and s.price_minor is not null
     and extract(dow from s.start_date) = 6
     and s.start_date between current_date + 14 and current_date + 120
    join listing_free_period f
      on f.listing_offer_id = o.id
     and f.start_date <= s.start_date
     and f.end_date >= s.start_date + 13
    where r.resource_type = 'yacht'
      and r.active
      and jsonb_typeof(rp.payload->'allCheckInDays') = 'array'
      and ${listed}
    order by r.external_id, s.start_date
  `);

  /* Shuffled after the distinct, so the sample is not the lowest yacht ids. */
  return rows
    .map((row) => ({ ...row, group, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, limit)
    .map(({ sort: _sort, ...row }) => row);
}

/* The first Saturday inside the stretch, and weeks from it that all still fit. */
function weeksFor(sample: Sample): { day: keyof typeof WEEKDAYS; from: string; to: string }[] {
  const start = Date.parse(`${sample.freeFrom}T00:00:00Z`);
  const saturday = start + ((6 - new Date(start).getUTCDay() + 7) % 7) * DAY_MS;
  return DAYS.map((day) => {
    const from = saturday + ((WEEKDAYS[day] - 6 + 7) % 7) * DAY_MS;
    return { day, from: iso(from), to: iso(from + 7 * DAY_MS) };
  }).filter((week) => week.to <= sample.freeTo);
}

async function main(): Promise<void> {
  const client = new BookingManagerClient({ config: resolveBookingManagerConfig() });
  const all = [
    ...(await samples("any day", Number(args.yachts))),
    ...(await samples("some days, Saturday among them", Number(args.partial))),
  ];

  type Tally = { asked: number; offered: number };
  const tally = new Map<string, Tally>();
  const saturdayOnly: string[] = [];

  for (const sample of all) {
    const offeredDays: string[] = [];
    for (const week of weeksFor(sample)) {
      const rows = await client.get(bookingManagerEndpoints.offers, restOfferListSchema, {
        dateFrom: formatBookingManagerDateTime(week.from),
        dateTo: formatBookingManagerDateTime(week.to),
        /* As a string: Booking Manager ids run past 2^53, and a number rounds to another yacht. */
        yachtId: [sample.yachtId],
        currency: "EUR",
      });
      const offered = rows.some(
        (row) =>
          String(row.yachtId) === sample.yachtId &&
          String(row.dateFrom).slice(0, 10) === week.from &&
          row.price != null &&
          row.price > 0,
      );
      const listed = sample.listedDays.includes(bmDay(WEEKDAYS[week.day]));
      const key = `${sample.group} | ${week.day.padEnd(9)} | ${listed ? "listed" : "not listed"}`;
      const entry = tally.get(key) ?? { asked: 0, offered: 0 };
      entry.asked += 1;
      if (offered) entry.offered += 1;
      tally.set(key, entry);
      if (offered) offeredDays.push(week.day);
    }
    if (offeredDays.length === 1 && offeredDays[0] === "Saturday")
      saturdayOnly.push(sample.yachtId);
    console.log(
      `${sample.group.padEnd(30)} yacht ${sample.yachtId} free ${sample.freeFrom}..${sample.freeTo} offered: ${offeredDays.join(", ") || "nothing"}`,
    );
  }

  console.log("\nOffered / asked, by the day the week starts:\n");
  for (const [key, { asked, offered }] of [...tally].sort()) {
    console.log(
      `  ${key}  ${String(offered).padStart(3)} / ${String(asked).padEnd(3)} (${Math.round((100 * offered) / asked)}%)`,
    );
  }
  console.log(
    `\nYachts offered on Saturday and nothing else: ${saturdayOnly.length}${saturdayOnly.length ? ` (${saturdayOnly.join(", ")})` : ""}`,
  );
  process.exit(0);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
