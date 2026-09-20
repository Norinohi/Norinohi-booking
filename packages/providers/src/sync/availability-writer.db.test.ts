import { availabilitySlot, listingRefusedPeriod } from "@yacht-charter/db/schema/availability";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { seedListing, seedSearchWorld } from "@yacht-charter/db/test-support/search-fixture";
import { and, eq, sql } from "drizzle-orm";
import { log } from "evlog";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createDrizzleAvailabilitySyncStore,
  type AvailabilitySlotWrite,
  type ConfirmSlotInput,
  type ListingRef,
} from "./availability-writer";

/*
 * The Drizzle store against a real Postgres: which confirmed prices and occupied rows are
 * actually rewritten, and which charters the refusal sweep may judge.
 */

let test: TestDatabase;

const T0 = new Date("2026-09-01T02:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
  test = await createTestDatabase();
  await seedSearchWorld(test.db);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

function store(providerId = "prov_ns") {
  return createDrizzleAvailabilitySyncStore({ db: test.db, providerId, syncRunId: "sync_test" });
}

async function refOf(slug: string, providerId: "prov_ns" | "prov_bm" = "prov_ns") {
  const seeded = await seedListing(test.db, slug, {
    free: { from: "2027-01-01", to: "2027-12-31" },
    providerId,
  });
  return {
    listingId: seeded.listingId,
    listingSourceId: `lsrc_${slug}`,
    listingOfferId: seeded.offerId,
  } satisfies ListingRef;
}

function confirmation(ref: ListingRef, overrides: Partial<ConfirmSlotInput> = {}) {
  return {
    ...ref,
    startDate: "2027-06-05",
    endDate: "2027-06-12",
    priceMinor: 300_000,
    obligatoryExtrasMinor: 20_000,
    listPriceMinor: null,
    commissionMinor: null,
    commissionPct: null,
    currency: "EUR",
    sourceHash: "hash-a",
    seenAt: T0,
    ...overrides,
  } satisfies ConfirmSlotInput;
}

async function offerCommissionOf(offerId: string) {
  const [row] = await test.db
    .select({
      commissionPct: listingOffer.commissionPct,
      commissionSeenAt: listingOffer.commissionSeenAt,
    })
    .from(listingOffer)
    .where(eq(listingOffer.id, offerId));
  return row;
}

async function slotOf(offerId: string, startDate = "2027-06-05", endDate = "2027-06-12") {
  const [row] = await test.db
    .select({
      status: availabilitySlot.status,
      priceMinor: availabilitySlot.priceMinor,
      obligatoryExtrasMinor: availabilitySlot.obligatoryExtrasMinor,
      listPriceMinor: availabilitySlot.listPriceMinor,
      commissionMinor: availabilitySlot.commissionMinor,
      commissionPct: availabilitySlot.commissionPct,
      availabilityConfirmed: availabilitySlot.availabilityConfirmed,
      updatedAt: availabilitySlot.updatedAt,
      version: sql<string>`xmin::text`,
    })
    .from(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.listingOfferId, offerId),
        eq(availabilitySlot.startDate, startDate),
        eq(availabilitySlot.endDate, endDate),
      ),
    );
  return row;
}

describe("confirmSlots", () => {
  it("inserts a period the vendor priced that no slot held yet", async () => {
    const ref = await refOf("confirm-new");

    expect(await store().confirmSlots([confirmation(ref)])).toEqual([ref.listingId]);
    expect(await slotOf(ref.listingOfferId)).toMatchObject({
      status: "available",
      availabilityConfirmed: true,
      priceMinor: 300_000,
      obligatoryExtrasMinor: 20_000,
      updatedAt: T0,
    });
  });

  it("leaves a restated, unchanged price unwritten and out of the rebuild", async () => {
    const ref = await refOf("confirm-same");
    await store().confirmSlots([confirmation(ref)]);
    const before = await slotOf(ref.listingOfferId);

    const changed = await store().confirmSlots([
      confirmation(ref, { seenAt: new Date(T0.getTime() + HOUR) }),
    ]);

    expect(changed).toEqual([]);
    const after = await slotOf(ref.listingOfferId);
    expect(after?.version).toBe(before?.version);
    expect(after?.updatedAt).toEqual(T0);
  });

  it("restamps an unchanged price once its stamp is a day old, so the sweep keeps it", async () => {
    const ref = await refOf("confirm-restamp");
    await store().confirmSlots([confirmation(ref)]);
    const later = new Date(T0.getTime() + 2 * DAY);

    expect(await store().confirmSlots([confirmation(ref, { seenAt: later })])).toEqual([]);
    expect((await slotOf(ref.listingOfferId))?.updatedAt).toEqual(later);
  });

  it("rewrites a price that moved and reports it", async () => {
    const ref = await refOf("confirm-moved");
    await store().confirmSlots([confirmation(ref)]);

    const changed = await store().confirmSlots([
      confirmation(ref, { priceMinor: 280_000, sourceHash: "hash-b", seenAt: T0 }),
    ]);

    expect(changed).toEqual([ref.listingId]);
    expect(await slotOf(ref.listingOfferId)).toMatchObject({ priceMinor: 280_000 });
  });

  it("never touches a period an option holds", async () => {
    const ref = await refOf("confirm-option");
    await test.db.insert(availabilitySlot).values({
      listingId: ref.listingId,
      listingSourceId: ref.listingSourceId,
      listingOfferId: ref.listingOfferId,
      startDate: "2027-06-05",
      endDate: "2027-06-12",
      status: "option",
      priceMinor: null,
      updatedAt: T0,
    });
    const before = await slotOf(ref.listingOfferId);

    expect(await store().confirmSlots([confirmation(ref)])).toEqual([]);
    const after = await slotOf(ref.listingOfferId);
    expect(after).toMatchObject({ status: "option", priceMinor: null });
    expect(after?.version).toBe(before?.version);
  });

  it("skips a retired record, which has no offer to write under", async () => {
    const ref = await refOf("confirm-retired");

    expect(await store().confirmSlots([confirmation({ ...ref, listingOfferId: null })])).toEqual(
      [],
    );
    expect(await slotOf(ref.listingOfferId)).toBeUndefined();
  });

  it("counts an unstorable price it would have written, and only that one", async () => {
    const free = await refOf("confirm-unstorable");
    const held = await refOf("confirm-unstorable-held");
    await test.db.insert(availabilitySlot).values({
      listingId: held.listingId,
      listingSourceId: held.listingSourceId,
      listingOfferId: held.listingOfferId,
      startDate: "2027-06-05",
      endDate: "2027-06-12",
      status: "occupied",
      updatedAt: T0,
    });
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const run = store();

    const changed = await run.confirmSlots([
      confirmation(free, { priceMinor: 8_883_888_500 }),
      confirmation(held, { obligatoryExtrasMinor: 8_883_888_500 }),
    ]);
    await run.closeRun({
      status: "success",
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      finishedAt: T0,
    });

    expect(changed).toEqual([]);
    expect(await slotOf(free.listingOfferId)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "availability.amounts_not_stored", count: 1 }),
    );
    warn.mockRestore();
  });

  /*
   * The commission is why the sweep stores anything about money that is not the customer's:
   * both vendors state it per week, per boat, and nowhere in the catalogue, so the slot is
   * the only place it can be kept.
   */
  it("stores the commission the vendor quoted for the week", async () => {
    const ref = await refOf("confirm-commission");

    await store().confirmSlots([confirmation(ref, { commissionMinor: 60_000, commissionPct: 20 })]);

    expect(await slotOf(ref.listingOfferId)).toMatchObject({
      commissionMinor: 60_000,
      commissionPct: "20.0000",
    });
  });

  /* The fleet list asks one question per boat, and aggregating every stored week to answer it
     made that screen a scan of the price history. */
  it("carries the rate up onto the offer, newest week last", async () => {
    const ref = await refOf("confirm-commission-stamp");

    await store().confirmSlots([confirmation(ref, { commissionPct: 15 })]);
    expect(await offerCommissionOf(ref.listingOfferId)).toMatchObject({
      commissionPct: "15.0000",
      commissionSeenAt: T0,
    });

    const later = new Date(T0.getTime() + DAY);
    await store().confirmSlots([
      confirmation(ref, {
        startDate: "2027-07-03",
        endDate: "2027-07-10",
        commissionPct: 18,
        seenAt: later,
      }),
    ]);
    expect(await offerCommissionOf(ref.listingOfferId)).toMatchObject({
      commissionPct: "18.0000",
      commissionSeenAt: later,
    });
  });

  /* An older page arriving late is not news, and a week with nothing said about it is not a
     statement that the boat pays nothing. */
  it("keeps the rate against a stale page and against a week that states none", async () => {
    const ref = await refOf("confirm-commission-stale");

    await store().confirmSlots([confirmation(ref, { commissionPct: 17 })]);

    await store().confirmSlots([
      confirmation(ref, {
        startDate: "2027-07-10",
        endDate: "2027-07-17",
        commissionPct: 9,
        seenAt: new Date(T0.getTime() - DAY),
      }),
      confirmation(ref, {
        startDate: "2027-07-17",
        endDate: "2027-07-24",
        commissionPct: null,
        seenAt: new Date(T0.getTime() + DAY),
      }),
    ]);

    expect(await offerCommissionOf(ref.listingOfferId)).toMatchObject({
      commissionPct: "17.0000",
      commissionSeenAt: T0,
    });
  });

  it("drops a strike-through that will not fit and keeps the price", async () => {
    const ref = await refOf("confirm-list-price");

    await store().confirmSlots([confirmation(ref, { listPriceMinor: 8_883_888_500 })]);

    expect(await slotOf(ref.listingOfferId)).toMatchObject({
      priceMinor: 300_000,
      listPriceMinor: null,
    });
  });
});

describe("writeSlots", () => {
  function occupied(ref: ListingRef, overrides: Partial<AvailabilitySlotWrite> = {}) {
    return {
      listingId: ref.listingId,
      listingSourceId: ref.listingSourceId,
      listingOfferId: ref.listingOfferId ?? "",
      startDate: "2027-07-03",
      endDate: "2027-07-10",
      status: "occupied",
      optionExpiresAt: null,
      availabilityConfirmed: true,
      priceMinor: null,
      currency: null,
      minNights: null,
      checkinWeekday: null,
      checkoutWeekday: null,
      sourceHash: "hash-occupied",
      seenAt: T0,
      ...overrides,
    } satisfies AvailabilitySlotWrite;
  }

  it("does not rewrite a row this run already wrote unchanged", async () => {
    const ref = await refOf("write-same");
    await store().writeSlots([occupied(ref)]);
    const before = await slotOf(ref.listingOfferId ?? "", "2027-07-03", "2027-07-10");

    await store().writeSlots([occupied(ref)]);

    const after = await slotOf(ref.listingOfferId ?? "", "2027-07-03", "2027-07-10");
    expect(after?.version).toBe(before?.version);
  });

  it("still restamps an unchanged row for a later run, which the sweep reads", async () => {
    const ref = await refOf("write-restamp");
    await store().writeSlots([occupied(ref)]);
    const later = new Date(T0.getTime() + HOUR);

    await store().writeSlots([occupied(ref, { seenAt: later })]);

    expect((await slotOf(ref.listingOfferId ?? "", "2027-07-03", "2027-07-10"))?.updatedAt).toEqual(
      later,
    );
  });

  it("rewrites a row whose status moved", async () => {
    const ref = await refOf("write-moved");
    await store().writeSlots([occupied(ref, { status: "option" })]);

    await store().writeSlots([occupied(ref)]);

    expect(await slotOf(ref.listingOfferId ?? "", "2027-07-03", "2027-07-10")).toMatchObject({
      status: "occupied",
    });
  });
});

describe("replaceRefusedPeriods", () => {
  async function bandedRef(
    slug: string,
    providerId: "prov_ns" | "prov_bm",
    rates: { from: string; to: string }[],
  ) {
    const seeded = await seedListing(test.db, slug, {
      free: { from: "2027-01-01", to: "2027-12-31" },
      providerId,
      rates: rates.map((rate) => ({ ...rate, priceMinor: 400_000 })),
    });
    return seeded;
  }

  async function refusalsOf(offerId: string) {
    return test.db
      .select({
        id: listingRefusedPeriod.id,
        startDate: listingRefusedPeriod.startDate,
        endDate: listingRefusedPeriod.endDate,
        updatedAt: listingRefusedPeriod.updatedAt,
      })
      .from(listingRefusedPeriod)
      .where(eq(listingRefusedPeriod.listingOfferId, offerId));
  }

  function sweep(
    startDate: string,
    endDate: string,
    externalYachtIds: string[],
    offeredListingIds: string[] = [],
  ) {
    return { period: { startDate, endDate, scopeKeys: null, externalYachtIds }, offeredListingIds };
  }

  it("reads a NauSYS band written to the last night as covering the week", async () => {
    const offer = await bandedRef("refuse-ns-last-night", "prov_ns", [
      { from: "2027-10-02", to: "2027-10-08" },
    ]);

    const refused = await store("prov_ns").replaceRefusedPeriods(
      sweep("2027-10-02", "2027-10-09", ["refuse-ns-last-night"]),
    );

    expect(refused).toBe(1);
    expect(await refusalsOf(offer.offerId)).toHaveLength(1);
  });

  it("reads Saturday-cut Booking Manager bands as covering a Monday charter", async () => {
    const offer = await bandedRef("refuse-bm-monday", "prov_bm", [
      { from: "2027-08-28", to: "2027-09-04" },
      { from: "2027-09-04", to: "2027-09-11" },
    ]);

    expect(
      await store("prov_bm").replaceRefusedPeriods(
        sweep("2027-08-30", "2027-09-06", ["refuse-bm-monday"]),
      ),
    ).toBe(1);
    expect(await refusalsOf(offer.offerId)).toHaveLength(1);
  });

  it("does not judge a charter with a night no band prices", async () => {
    const offer = await bandedRef("refuse-gap", "prov_ns", [
      { from: "2027-10-02", to: "2027-10-04" },
      { from: "2027-10-06", to: "2027-10-09" },
    ]);

    expect(
      await store("prov_ns").replaceRefusedPeriods(
        sweep("2027-10-02", "2027-10-09", ["refuse-gap"]),
      ),
    ).toBe(0);
    expect(await refusalsOf(offer.offerId)).toEqual([]);
  });

  it("does not judge a charter whose first or last night is unpriced", async () => {
    const early = await bandedRef("refuse-late-start", "prov_ns", [
      { from: "2027-10-03", to: "2027-10-20" },
    ]);
    const late = await bandedRef("refuse-early-end", "prov_ns", [
      { from: "2027-09-20", to: "2027-10-07" },
    ]);

    await store("prov_ns").replaceRefusedPeriods(
      sweep("2027-10-02", "2027-10-09", ["refuse-late-start", "refuse-early-end"]),
    );

    expect(await refusalsOf(early.offerId)).toEqual([]);
    expect(await refusalsOf(late.offerId)).toEqual([]);
  });

  it("keeps a restated refusal's row, and lifts one the vendor now offers", async () => {
    const kept = await bandedRef("refuse-kept", "prov_ns", [
      { from: "2027-11-06", to: "2027-11-13" },
    ]);
    const lifted = await bandedRef("refuse-lifted", "prov_ns", [
      { from: "2027-11-06", to: "2027-11-13" },
    ]);
    const asked = ["refuse-kept", "refuse-lifted"];

    expect(
      await store("prov_ns").replaceRefusedPeriods(sweep("2027-11-06", "2027-11-13", asked)),
    ).toBe(2);
    const [first] = await refusalsOf(kept.offerId);

    expect(
      await store("prov_ns").replaceRefusedPeriods(
        sweep("2027-11-06", "2027-11-13", asked, [lifted.listingId]),
      ),
    ).toBe(1);

    const [restated] = await refusalsOf(kept.offerId);
    expect(restated?.id).toBe(first?.id);
    expect(restated?.updatedAt).toEqual(first?.updatedAt);
    expect(await refusalsOf(lifted.offerId)).toEqual([]);
  });

  it("restamps a restated refusal once its stamp is a day old", async () => {
    const offer = await bandedRef("refuse-restamp", "prov_ns", [
      { from: "2027-11-06", to: "2027-11-13" },
    ]);
    const asked = sweep("2027-11-06", "2027-11-13", ["refuse-restamp"]);
    await store("prov_ns").replaceRefusedPeriods(asked);
    await test.db
      .update(listingRefusedPeriod)
      .set({ updatedAt: sql`now() - interval '3 days'` })
      .where(eq(listingRefusedPeriod.listingOfferId, offer.offerId));

    await store("prov_ns").replaceRefusedPeriods(asked);

    const [row] = await refusalsOf(offer.offerId);
    expect(Date.now() - (row?.updatedAt.getTime() ?? 0)).toBeLessThan(DAY);
  });
});
