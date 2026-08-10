import { availabilitySlot } from "@yacht-charter/db/schema/availability";
import { and, eq, gte, lte } from "drizzle-orm";

import type { Database } from "../registry";
import { NotFoundError } from "../shared/errors";
import { availability } from "./data";

/*
 * Where the mock provider's inventory comes from.
 *
 * It used to come only from `fixtures/availability.json`, which covers ten yachts
 * and thirteen weeks, while the catalogue the app serves is seeded with every
 * listing and every season week. The two were authored separately, so
 * `availability.calendar` offered periods that `availability.quote` then refused:
 * a slot cannot be bookable and unpriceable at once.
 *
 * So the provider reads the same `availability_slot` rows the calendar reads. That
 * is not a shortcut around the provider boundary — under PROVIDER_MODE=mock those
 * rows *are* the vendor's inventory, exactly as a real vendor's would be after a
 * sync. The fixture source stays for unit tests, which have no database.
 */

const DEFAULT_MIN_NIGHTS = 7;
const DEFAULT_CHECKIN_WEEKDAY = 6; // Saturday

export interface MockSlot {
  listingId: string;
  yachtId: string;
  startDate: string;
  endDate: string;
  status: string;
  priceMinor: number;
  currency: string;
  /** Charter weeks in this market: seven nights, Saturday to Saturday. */
  minNights: number;
  checkinWeekday: number;
  checkoutWeekday: number;
}

export interface MockInventorySource {
  findSlot(listingId: string, checkIn: string, checkOut: string): Promise<MockSlot | null>;
  /** The reservation reference carries a start date but not an end date. */
  findSlotByStart(listingId: string, startDate: string): Promise<MockSlot | null>;
  listSlots(listingId: string, from: string, to: string): Promise<MockSlot[]>;
}

/** `ylst_yacht-lagoon-42-aurora` ↔ `yacht-lagoon-42-aurora`, the fixture's id. */
export const yachtIdFromListingId = (listingId: string) => listingId.replace(/^ylst_/, "");
export const listingIdFromYachtId = (yachtId: string) => `ylst_${yachtId}`;

/**
 * Reads a reservation reference back into the trip it stands for.
 *
 * The reference is self-describing — `res_qte_mock_<yacht>_<start-date>` — so the
 * yacht and the date are parsed rather than looked up, and only the period is
 * asked of the inventory. Resolving the yacht through the catalogue fixture, as
 * this used to, meant a booking on any listing outside those ten could never be
 * cancelled or have its extras changed.
 */
export async function resolveReference(
  reference: string,
  inventory: MockInventorySource,
): Promise<{
  yachtId: string;
  listingId: string;
  quoteId: string;
  checkIn: string;
  checkOut: string;
}> {
  const normalized = reference.replaceAll("_", "-");
  const startDate = /\d{4}-\d{2}-\d{2}/.exec(normalized)?.[0];
  const yachtId = /^(?:res|opt)-qte-mock-(.+?)-\d{4}-\d{2}-\d{2}$/.exec(normalized)?.[1];

  if (!yachtId || !startDate) {
    throw new NotFoundError(`Unreadable mock reservation reference "${reference}"`);
  }

  const listingId = listingIdFromYachtId(yachtId);
  const slot = await inventory.findSlotByStart(listingId, startDate);
  if (!slot) {
    throw new NotFoundError(`No mock period behind reservation reference "${reference}"`);
  }

  return {
    yachtId,
    listingId,
    quoteId: reference.replace(/^(res|opt)_/, ""),
    checkIn: slot.startDate,
    checkOut: slot.endDate,
  };
}

/** Fixture-backed. Ten yachts, thirteen weeks — enough to unit-test pricing. */
export function fixtureInventorySource(): MockInventorySource {
  const all = (listingId: string): MockSlot[] =>
    availability.slots
      // endsWith rather than equality: fixture ids are yacht ids, and a listing id
      // is that same id behind our prefix.
      .filter((slot) => listingId.endsWith(slot.yachtId))
      .map((slot) => ({
        listingId,
        yachtId: slot.yachtId,
        startDate: slot.startDate,
        endDate: slot.endDate,
        status: slot.status,
        priceMinor: slot.priceMinor,
        currency: slot.currency,
        minNights: slot.minNights,
        checkinWeekday: slot.checkinWeekday,
        checkoutWeekday: slot.checkoutWeekday,
      }));

  return {
    async findSlot(listingId, checkIn, checkOut) {
      return (
        all(listingId).find((slot) => slot.startDate === checkIn && slot.endDate === checkOut) ??
        null
      );
    },
    async findSlotByStart(listingId, startDate) {
      return all(listingId).find((slot) => slot.startDate === startDate) ?? null;
    },
    async listSlots(listingId, from, to) {
      return all(listingId).filter((slot) => slot.startDate >= from && slot.endDate <= to);
    },
  };
}

/** Database-backed: the same rows `availability.calendar` serves. */
export function databaseInventorySource(db: Database): MockInventorySource {
  const toSlot = (row: typeof availabilitySlot.$inferSelect): MockSlot => ({
    listingId: row.listingId,
    yachtId: yachtIdFromListingId(row.listingId),
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    // A slot with no price is not quotable; the caller reads it as unavailable
    // rather than quoting a charter at nothing.
    priceMinor: row.priceMinor ?? 0,
    currency: row.currency ?? "EUR",
    // The seeded catalogue leaves these null; the calendar contract requires
    // them, and every mock period is a Saturday-to-Saturday week.
    minNights: row.minNights ?? DEFAULT_MIN_NIGHTS,
    checkinWeekday: row.checkinWeekday ?? DEFAULT_CHECKIN_WEEKDAY,
    checkoutWeekday: row.checkoutWeekday ?? DEFAULT_CHECKIN_WEEKDAY,
  });

  return {
    async findSlot(listingId, checkIn, checkOut) {
      const [row] = await db
        .select()
        .from(availabilitySlot)
        .where(
          and(
            eq(availabilitySlot.listingId, listingId),
            eq(availabilitySlot.startDate, checkIn),
            eq(availabilitySlot.endDate, checkOut),
          ),
        )
        .limit(1);

      return row && row.priceMinor !== null ? toSlot(row) : null;
    },

    async findSlotByStart(listingId, startDate) {
      const [row] = await db
        .select()
        .from(availabilitySlot)
        .where(
          and(eq(availabilitySlot.listingId, listingId), eq(availabilitySlot.startDate, startDate)),
        )
        .limit(1);

      return row ? toSlot(row) : null;
    },

    async listSlots(listingId, from, to) {
      const rows = await db
        .select()
        .from(availabilitySlot)
        .where(
          and(
            eq(availabilitySlot.listingId, listingId),
            gte(availabilitySlot.startDate, from),
            lte(availabilitySlot.endDate, to),
          ),
        );

      return rows.map(toSlot);
    },
  };
}
