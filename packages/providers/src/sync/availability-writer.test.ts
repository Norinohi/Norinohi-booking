import { describe, expect, it } from "vitest";

import { AuthError, TransientError } from "../shared/errors";
import {
  DEFAULT_CHECKIN_RULE,
  runAvailabilitySync,
  synthesizeAvailableSlots,
  type AvailabilityScope,
  type AvailabilitySlotWrite,
  type AvailabilitySource,
  type AvailabilitySyncStore,
  type CheckinRule,
  type ConfirmedOfferPage,
  type ListingAvailabilityPlan,
  type ListingRef,
  type OccupiedInterval,
} from "./availability-writer";

const RUN_AT = new Date("2026-06-01T02:00:00.000Z");

const SATURDAY_RULE: CheckinRule = { checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 };

interface StoredSlot extends Omit<AvailabilitySlotWrite, "seenAt"> {
  updatedAt: Date;
}

interface FakeStoreSeed {
  listings?: Record<string, ListingRef[]>;
  yachts?: Record<string, ListingRef>;
  plans?: Record<string, Partial<ListingAvailabilityPlan>>;
  slots?: StoredSlot[];
}

/**
 * Stands in for the Drizzle store. What is worth protecting lives in the loop, not
 * in the SQL: which scopes may be swept, what synthesis is allowed to assert, and
 * that a budget stop leaves a cursor behind.
 */
type RecordedError = Parameters<AvailabilitySyncStore["recordError"]>[0];

function fakeStore(seed: FakeStoreSeed = {}) {
  const slots = new Map<string, StoredSlot>();
  const errors: RecordedError[] = [];
  const cursors: unknown[] = [];
  const rebuilt: string[][] = [];
  const closed: {
    status: string;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
  }[] = [];

  const keyOf = (listingId: string, startDate: string, endDate: string) =>
    `${listingId}|${startDate}|${endDate}`;

  for (const slot of seed.slots ?? []) {
    slots.set(keyOf(slot.listingId, slot.startDate, slot.endDate), { ...slot });
  }

  const store: AvailabilitySyncStore = {
    syncRunId: "sync_availability",
    async startRun() {},
    async resolveListing(externalYachtId) {
      return seed.yachts?.[externalYachtId] ?? null;
    },
    async listListingsForScope(scopeKey) {
      return seed.listings?.[scopeKey] ?? [];
    },
    async loadPlans(listingIds) {
      const plans = new Map<string, ListingAvailabilityPlan>();
      for (const listingId of listingIds) {
        const partial = seed.plans?.[listingId];
        plans.set(listingId, {
          checkinRules: partial?.checkinRules ?? [SATURDAY_RULE],
          prices: partial?.prices ?? [],
          currency: partial?.currency ?? "EUR",
        });
      }
      return plans;
    },
    async writeSlots(written) {
      for (const slot of written) {
        const { seenAt, ...rest } = slot;
        slots.set(keyOf(slot.listingId, slot.startDate, slot.endDate), {
          ...rest,
          updatedAt: seenAt,
        });
      }
    },
    async confirmSlot(input) {
      const key = keyOf(input.listingId, input.startDate, input.endDate);
      const existing = slots.get(key);
      if (existing && existing.status !== "available") return false;

      slots.set(key, {
        listingId: input.listingId,
        listingSourceId: input.listingSourceId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "available",
        availabilityConfirmed: true,
        priceMinor: input.priceMinor,
        currency: input.currency,
        minNights: existing?.minNights ?? null,
        checkinWeekday: existing?.checkinWeekday ?? null,
        checkoutWeekday: existing?.checkoutWeekday ?? null,
        sourceHash: input.sourceHash,
        updatedAt: input.seenAt,
      });
      return true;
    },
    async sweepScope(input) {
      const listingIds = new Set(input.listings.map((ref) => ref.listingId));
      let deleted = 0;
      for (const [key, slot] of slots) {
        if (!listingIds.has(slot.listingId)) continue;
        if (slot.startDate < `${input.year}-01-01` || slot.startDate > `${input.year}-12-31`) {
          continue;
        }
        if (slot.updatedAt >= input.seenBefore) continue;
        slots.delete(key);
        deleted += 1;
      }
      return deleted;
    },
    async recordError(input) {
      errors.push({ errorType: input.errorType, message: input.message, context: input.context });
    },
    async saveCursor(cursor) {
      cursors.push(cursor);
    },
    async closeRun(input) {
      closed.push({
        status: input.status,
        createdCount: input.createdCount,
        updatedCount: input.updatedCount,
        skippedCount: input.skippedCount,
        failedCount: input.failedCount,
      });
    },
    async rebuildSearch(listingIds) {
      rebuilt.push([...listingIds].sort());
    },
  };

  return {
    store,
    errors,
    cursors,
    closed,
    rebuilt,
    slots,
    listOf(listingId: string, status?: StoredSlot["status"]) {
      return [...slots.values()]
        .filter((slot) => slot.listingId === listingId)
        .filter((slot) => (status ? slot.status === status : true))
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
    },
  };
}

function source(overrides: Partial<AvailabilitySource> & { scopes?: AvailabilityScope[] } = {}) {
  const scopes = overrides.scopes ?? [{ scopeKey: "102701", year: 2026 }];
  const built: AvailabilitySource = {
    listScopes: overrides.listScopes ?? (() => Promise.resolve(scopes)),
    fetchOccupancy: overrides.fetchOccupancy ?? (() => Promise.resolve([])),
  };
  // A source with no hot window must not carry the key at all: the writer branches
  // on its presence, not on whether it is defined.
  if (overrides.searchConfirmed) built.searchConfirmed = overrides.searchConfirmed;
  return built;
}

const MARLIN: ListingRef = { listingId: "ylst_marlin", listingSourceId: "lsrc_marlin" };

function occupied(overrides: Partial<OccupiedInterval> = {}): OccupiedInterval {
  return {
    externalYachtId: "4711001",
    startDate: "2026-06-27",
    endDate: "2026-07-04",
    status: "occupied",
    sourceHash: "hash-occupied",
    ...overrides,
  };
}

describe("synthesizeAvailableSlots", () => {
  const window = { start: "2026-06-01", end: "2026-08-31" };

  it("emits periods on the rule's check-in weekday for its minimum duration", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [window],
      rules: [SATURDAY_RULE],
      occupied: [],
    });

    expect(slots[0]).toMatchObject({
      startDate: "2026-06-06",
      endDate: "2026-06-13",
      minNights: 7,
      checkinWeekday: 6,
      checkoutWeekday: 6,
    });
    // Every start is a Saturday, seven nights apart.
    for (const slot of slots) {
      expect(new Date(`${slot.startDate}T00:00:00Z`).getUTCDay()).toBe(6);
    }
  });

  it("honours a rule that is not Saturday and not seven nights", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-06-30" }],
      rules: [{ checkinWeekday: 3, checkoutWeekday: null, minNights: 4 }],
      occupied: [],
    });

    expect(slots.map((slot) => [slot.startDate, slot.endDate])).toEqual([
      ["2026-06-03", "2026-06-07"],
      ["2026-06-10", "2026-06-14"],
      ["2026-06-17", "2026-06-21"],
      ["2026-06-24", "2026-06-28"],
    ]);
  });

  it("stretches to the check-out weekday when the minimum lands elsewhere", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-06-30" }],
      rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 5 }],
      occupied: [],
    });

    expect(slots[0]).toMatchObject({ startDate: "2026-06-06", endDate: "2026-06-13" });
  });

  it("drops every candidate overlapping an occupied or option period", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [window],
      rules: [SATURDAY_RULE],
      occupied: [
        { startDate: "2026-06-27", endDate: "2026-07-04" },
        { startDate: "2026-07-18", endDate: "2026-07-25" },
      ],
    });

    const periods = slots.map((slot) => slot.startDate);
    expect(periods).not.toContain("2026-06-27");
    expect(periods).not.toContain("2026-07-18");
    // A charter ending the day the next begins is a turnaround, not a clash.
    expect(periods).toContain("2026-07-04");
    expect(periods).toContain("2026-07-25");
  });

  it("never emits a period that leaves the window", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-06-20" }],
      rules: [SATURDAY_RULE],
      occupied: [],
    });

    expect(slots.at(-1)?.endDate).toBe("2026-06-20");
  });

  it("falls back to Saturday to Saturday for a listing with no rule, and says so", () => {
    const result = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-06-30" }],
      rules: [],
      occupied: [],
    });

    expect(result.usedFallback).toBe(true);
    expect(result.slots[0]).toMatchObject({
      startDate: "2026-06-06",
      minNights: DEFAULT_CHECKIN_RULE.minNights,
      checkinWeekday: DEFAULT_CHECKIN_RULE.checkinWeekday,
    });
  });

  it("prices from the seasonal list covering the check-in date", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-07-31" }],
      rules: [SATURDAY_RULE],
      occupied: [],
      prices: [
        { startDate: "2026-06-01", endDate: "2026-06-26", priceMinor: 320000, currency: "EUR" },
        { startDate: "2026-06-27", endDate: "2026-08-29", priceMinor: 390000, currency: "EUR" },
      ],
      currency: "EUR",
    });

    expect(slots[0]).toMatchObject({ startDate: "2026-06-06", priceMinor: 320000 });
    expect(slots.at(-1)).toMatchObject({ startDate: "2026-07-18", priceMinor: 390000 });
  });

  it("leaves the price null when nothing covers the period", () => {
    const { slots } = synthesizeAvailableSlots({
      windows: [{ start: "2026-06-01", end: "2026-06-30" }],
      rules: [SATURDAY_RULE],
      occupied: [],
      currency: "EUR",
    });

    expect(slots[0]).toMatchObject({ priceMinor: null, currency: "EUR" });
  });
});

describe("runAvailabilitySync", () => {
  it("writes occupancy as occupied and option slots", async () => {
    const store = fakeStore({ yachts: { "4711001": MARLIN } });

    await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () =>
          Promise.resolve([
            occupied(),
            occupied({ startDate: "2026-07-18", endDate: "2026-07-25", status: "option" }),
          ]),
      }),
      now: () => RUN_AT,
    });

    expect(store.listOf("ylst_marlin", "occupied")).toHaveLength(1);
    expect(store.listOf("ylst_marlin", "option")[0]).toMatchObject({
      startDate: "2026-07-18",
      listingSourceId: "lsrc_marlin",
      availabilityConfirmed: true,
      sourceHash: "hash-occupied",
    });
  });

  it("skips and counts a yacht that is not linked to a listing yet", async () => {
    const store = fakeStore();

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
      now: () => RUN_AT,
    });

    expect(summary.skippedYachts).toBe(1);
    expect(store.slots.size).toBe(0);
    expect(store.closed[0]?.skippedCount).toBe(1);
  });

  it("synthesizes unconfirmed available slots around the occupied ones", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
      plans: {
        ylst_marlin: {
          checkinRules: [SATURDAY_RULE],
          prices: [
            { startDate: "2026-01-01", endDate: "2026-12-31", priceMinor: 390000, currency: "EUR" },
          ],
        },
      },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
      now: () => RUN_AT,
    });

    const available = store.listOf("ylst_marlin", "available");
    expect(summary.synthesizedSlots).toBe(available.length);
    expect(available.length).toBeGreaterThan(20);
    expect(available.map((slot) => slot.startDate)).not.toContain("2026-06-27");
    // Nothing here may claim the provider confirmed a period it was never asked about.
    for (const slot of available) {
      expect(slot.availabilityConfirmed).toBe(false);
      expect(slot.priceMinor).toBe(390000);
      expect(slot.listingSourceId).toBe("lsrc_marlin");
    }
  });

  it("stays inside the horizon and inside the year it fetched", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    await runAvailabilitySync({
      store: store.store,
      source: source(),
      horizonMonths: 12,
      now: () => RUN_AT,
    });

    const available = store.listOf("ylst_marlin", "available");
    expect(available[0]?.startDate.startsWith("2026-06")).toBe(true);
    // 2027 was never fetched, so nothing may be asserted about it.
    expect(available.at(-1)?.endDate.startsWith("2026-12")).toBe(true);
  });

  it("counts a listing with no check-in rule as a fallback", async () => {
    const store = fakeStore({
      listings: { "102701": [MARLIN] },
      plans: { ylst_marlin: { checkinRules: [] } },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source(),
      now: () => RUN_AT,
    });

    expect(summary.fallbackListings).toBe(1);
    expect(store.listOf("ylst_marlin", "available").length).toBeGreaterThan(0);
  });

  it("upgrades a synthesized slot to the vendor's confirmed price", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        searchConfirmed: async function* () {
          yield {
            offers: [
              {
                externalYachtId: "4711001",
                startDate: "2026-07-04",
                endDate: "2026-07-11",
                priceMinor: 334000,
                currency: "EUR",
                sourceHash: "hash-offer",
              },
            ],
            cursor: { windowIndex: 1, page: 1 },
          } satisfies ConfirmedOfferPage;
        },
      }),
      now: () => RUN_AT,
    });

    const slot = store
      .listOf("ylst_marlin", "available")
      .find((entry) => entry.startDate === "2026-07-04");
    expect(slot).toMatchObject({
      availabilityConfirmed: true,
      priceMinor: 334000,
      currency: "EUR",
    });
    expect(summary.confirmedSlots).toBe(1);
    expect(store.closed[0]?.updatedCount).toBe(1);
  });

  it("refuses to confirm a period the occupancy dump says is taken", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.resolve([occupied()]),
        searchConfirmed: async function* () {
          yield {
            offers: [
              {
                externalYachtId: "4711001",
                startDate: "2026-06-27",
                endDate: "2026-07-04",
                priceMinor: 334000,
                currency: "EUR",
                sourceHash: "hash-offer",
              },
            ],
            cursor: { windowIndex: 1, page: 1 },
          } satisfies ConfirmedOfferPage;
        },
      }),
      now: () => RUN_AT,
    });

    expect(summary.confirmedSlots).toBe(0);
    expect(
      store.listOf("ylst_marlin").find((slot) => slot.startDate === "2026-06-27")?.status,
    ).toBe("occupied");
  });

  it("stops the hot pass on the wall-clock budget with the cursor persisted", async () => {
    const store = fakeStore({ yachts: { "4711001": MARLIN }, listings: { "102701": [MARLIN] } });
    let clock = RUN_AT.getTime();
    const pagesPulled: number[] = [];

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        searchConfirmed: async function* () {
          for (let page = 1; page <= 10; page += 1) {
            pagesPulled.push(page);
            // Each page costs a second of the budget.
            clock += 1000;
            yield { offers: [], cursor: { windowIndex: 0, page: page + 1 } };
          }
        },
      }),
      hotWindowBudgetMs: 2500,
      now: () => new Date(clock),
    });

    expect(pagesPulled).toEqual([1, 2, 3]);
    expect(summary.budgetExhausted).toBe(true);
    // Resumes where it stopped rather than restarting the walk.
    expect(store.cursors.at(-1)).toEqual({ windowIndex: 0, page: 4 });
  });

  it("clears the cursor once the hot pass runs out of pages", async () => {
    const store = fakeStore();

    await runAvailabilitySync({
      store: store.store,
      source: source({
        searchConfirmed: async function* () {
          yield { offers: [], cursor: { windowIndex: 0, page: 2 } };
        },
      }),
      now: () => RUN_AT,
    });

    expect(store.cursors.at(-1)).toBeNull();
  });

  it("keeps the cursor and reports when the hot pass throws", async () => {
    const store = fakeStore();

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        searchConfirmed: async function* () {
          yield { offers: [], cursor: { windowIndex: 0, page: 2 } };
          throw new TransientError("freeYachtsSearch timed out");
        },
      }),
      now: () => RUN_AT,
    });

    expect(store.cursors).toEqual([{ windowIndex: 0, page: 2 }]);
    expect(summary.status).toBe("partial");
    expect(store.errors[0]?.context).toMatchObject({ phase: "hot-window" });
  });

  it("deletes only stale slots inside the fetched company and year", async () => {
    // Midweek on purpose: a Saturday period would be re-synthesized and so would
    // survive by being re-seen rather than by the sweep sparing it.
    const stale = (listingId: string, startDate: string, endDate: string): StoredSlot => ({
      listingId,
      listingSourceId: `lsrc_${listingId}`,
      startDate,
      endDate,
      status: "occupied",
      availabilityConfirmed: true,
      priceMinor: null,
      currency: null,
      minNights: null,
      checkinWeekday: null,
      checkoutWeekday: null,
      sourceHash: "stale",
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
      plans: { ylst_marlin: { checkinRules: [{ ...SATURDAY_RULE, minNights: 7 }] } },
      slots: [
        stale("ylst_marlin", "2026-09-02", "2026-09-09"),
        stale("ylst_marlin", "2027-09-01", "2027-09-08"),
        stale("ylst_other", "2026-09-02", "2026-09-09"),
      ],
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
      now: () => RUN_AT,
    });

    expect(summary.deletedSlots).toBe(1);
    const marlin = store.listOf("ylst_marlin").map((slot) => slot.startDate);
    expect(marlin).not.toContain("2026-09-02");
    // 2027 was never fetched, so its slots are not this run's to remove.
    expect(marlin).toContain("2027-09-01");
    // Another listing under another scope is untouched.
    expect(store.listOf("ylst_other")).toHaveLength(1);
  });

  it("deletes nothing when the occupancy fetch fails", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
      slots: [
        {
          listingId: "ylst_marlin",
          listingSourceId: "lsrc_marlin",
          startDate: "2026-09-05",
          endDate: "2026-09-12",
          status: "occupied",
          availabilityConfirmed: true,
          priceMinor: null,
          currency: null,
          minNights: null,
          checkinWeekday: null,
          checkoutWeekday: null,
          sourceHash: "stale",
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.reject(new TransientError("occupancy timed out")),
      }),
      now: () => RUN_AT,
    });

    expect(summary.deletedSlots).toBe(0);
    expect(summary.sweptScopes).toBe(0);
    expect(summary.synthesizedSlots).toBe(0);
    expect(summary.status).toBe("partial");
    expect(store.slots.size).toBe(1);
  });

  it("sweeps the year that succeeded and leaves the year that failed alone", async () => {
    const staleIn = (year: number): StoredSlot => ({
      listingId: "ylst_marlin",
      listingSourceId: "lsrc_marlin",
      startDate: `${year}-11-04`,
      endDate: `${year}-11-11`,
      status: "occupied",
      availabilityConfirmed: true,
      priceMinor: null,
      currency: null,
      minNights: null,
      checkinWeekday: null,
      checkoutWeekday: null,
      sourceHash: "stale",
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
      slots: [staleIn(2026), staleIn(2027)],
    });

    await runAvailabilitySync({
      store: store.store,
      source: source({
        scopes: [
          { scopeKey: "102701", year: 2026 },
          { scopeKey: "102701", year: 2027 },
        ],
        fetchOccupancy: (scope) =>
          scope.year === 2027
            ? Promise.reject(new TransientError("occupancy 2027 timed out"))
            : Promise.resolve([]),
      }),
      now: () => RUN_AT,
    });

    const remaining = store.listOf("ylst_marlin").map((slot) => slot.startDate);
    expect(remaining).toContain("2027-11-04");
    expect(remaining).not.toContain("2026-11-04");
  });

  it("does not sweep another company's slots", async () => {
    const rival: ListingRef = { listingId: "ylst_rival", listingSourceId: "lsrc_rival" };
    const store = fakeStore({
      listings: { "102701": [MARLIN] },
      slots: [
        {
          listingId: rival.listingId,
          listingSourceId: rival.listingSourceId,
          startDate: "2026-09-05",
          endDate: "2026-09-12",
          status: "available",
          availabilityConfirmed: false,
          priceMinor: 100000,
          currency: "EUR",
          minNights: 7,
          checkinWeekday: 6,
          checkoutWeekday: 6,
          sourceHash: "stale",
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    await runAvailabilitySync({ store: store.store, source: source(), now: () => RUN_AT });

    expect(store.listOf("ylst_rival")).toHaveLength(1);
  });

  it("aborts the run on an auth failure without sweeping", async () => {
    const store = fakeStore({ listings: { "102701": [MARLIN] } });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.reject(new AuthError("NauSYS rejected the credentials")),
      }),
      now: () => RUN_AT,
    });

    expect(summary.aborted).toBe(true);
    expect(summary.status).toBe("failed");
    expect(summary.sweptScopes).toBe(0);
    expect(store.errors[0]).toMatchObject({ errorType: "auth" });
  });

  it("rebuilds the search read model for the listings it touched", async () => {
    const store = fakeStore({ yachts: { "4711001": MARLIN }, listings: { "102701": [MARLIN] } });

    await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
      now: () => RUN_AT,
    });

    expect(store.rebuilt).toEqual([["ylst_marlin"]]);
  });
});
