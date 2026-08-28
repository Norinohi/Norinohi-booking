import { describe, expect, it } from "vitest";

import { AuthError, ContractError, TransientError } from "../shared/errors";
import {
  ACCOUNT_WIDE_SCOPE,
  dedupeSlotsByPeriod,
  freePeriodsFrom,
  isFatalAuthOnly,
  runAvailabilitySync,
  type AvailabilityScope,
  type AvailabilitySlotWrite,
  type AvailabilitySource,
  type AvailabilitySyncProgress,
  type AvailabilitySyncStore,
  type ConfirmedOfferPage,
  type FreePeriod,
  type ListingRef,
  type OccupiedInterval,
} from "./availability-writer";

const RUN_AT = new Date("2026-06-01T02:00:00.000Z");

interface StoredSlot extends Omit<AvailabilitySlotWrite, "seenAt"> {
  updatedAt: Date;
}

interface FakeStoreSeed {
  listings?: Record<string, ListingRef[]>;
  yachts?: Record<string, ListingRef>;
  slots?: StoredSlot[];
  /** Who is priced-and-free for a period, which is what the real store works out in SQL. */
  refusable?: Record<string, ListingRef[]>;
}

/**
 * Stands in for the Drizzle store. What is worth protecting lives in the loop, not
 * in the SQL: which scopes may be swept, which years free periods may be asserted
 * for, and that a budget stop leaves a cursor behind.
 */
type RecordedError = Parameters<AvailabilitySyncStore["recordError"]>[0];

function fakeStore(seed: FakeStoreSeed = {}) {
  const slots = new Map<string, StoredSlot>();
  const freePeriods = new Map<string, FreePeriod & { listingId: string }>();
  const refused = new Map<string, FreePeriod & { listingId: string }>();
  const errors: RecordedError[] = [];
  // How many listings each batched write carried, so a regression back to one
  // statement per boat shows up as a test failure rather than as a slow sync.
  const freePeriodBatchSizes: number[] = [];
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
    async writeFreePeriods(writes, years) {
      freePeriodBatchSizes.push(writes.length);

      const replacing = new Set(writes.map((write) => write.ref.listingId));
      for (const [key, period] of freePeriods) {
        if (!replacing.has(period.listingId)) continue;
        if (years.some((year) => period.startDate.startsWith(String(year)))) {
          freePeriods.delete(key);
        }
      }
      for (const write of writes) {
        for (const period of write.periods) {
          freePeriods.set(keyOf(write.ref.listingId, period.startDate, period.endDate), {
            listingId: write.ref.listingId,
            ...period,
          });
        }
      }
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
    async replaceRefusedPeriods({ period, offeredListingIds }) {
      const eligible = seed.refusable?.[`${period.startDate}|${period.endDate}`] ?? [];
      for (const ref of eligible) {
        refused.delete(keyOf(ref.listingId, period.startDate, period.endDate));
      }

      const offered = new Set(offeredListingIds);
      const written = eligible.filter((ref) => !offered.has(ref.listingId));
      for (const ref of written) {
        refused.set(keyOf(ref.listingId, period.startDate, period.endDate), {
          listingId: ref.listingId,
          startDate: period.startDate,
          endDate: period.endDate,
        });
      }
      return written.length;
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
    freePeriodBatchSizes,
    refusedOf(listingId: string) {
      return [...refused.values()]
        .filter((period) => period.listingId === listingId)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((period) => ({ startDate: period.startDate, endDate: period.endDate }));
    },
    freeOf(listingId: string) {
      return [...freePeriods.values()]
        .filter((period) => period.listingId === listingId)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((period) => ({ startDate: period.startDate, endDate: period.endDate }));
    },
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
  // on its presence, not on whether it is defined. Same for `isFatal`, whose absence
  // has to fall back to the shared default rather than to `undefined`.
  if (overrides.searchConfirmed) built.searchConfirmed = overrides.searchConfirmed;
  if (overrides.isFatal) built.isFatal = overrides.isFatal;
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

describe("freePeriodsFrom", () => {
  const JULY = { start: "2026-07-01", end: "2026-07-31" };

  it("returns the whole window when nothing is booked", () => {
    expect(freePeriodsFrom({ windows: [JULY], occupied: [] })).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-31" },
    ]);
  });

  it("returns nothing when the window is sold end to end", () => {
    const occupied = [{ startDate: "2026-07-01", endDate: "2026-07-31" }];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([]);
  });

  it("returns the gaps around a booking", () => {
    const occupied = [{ startDate: "2026-07-11", endDate: "2026-07-18" }];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-11" },
      { startDate: "2026-07-18", endDate: "2026-07-31" },
    ]);
  });

  /* Back-to-back charters share a turnaround day, which is not free time between them. */
  it("leaves no gap between bookings that touch", () => {
    const occupied = [
      { startDate: "2026-07-04", endDate: "2026-07-11" },
      { startDate: "2026-07-11", endDate: "2026-07-18" },
    ];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-04" },
      { startDate: "2026-07-18", endDate: "2026-07-31" },
    ]);
  });

  it("does not re-open sold time when bookings overlap", () => {
    const occupied = [
      { startDate: "2026-07-04", endDate: "2026-07-20" },
      { startDate: "2026-07-11", endDate: "2026-07-18" },
    ];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-04" },
      { startDate: "2026-07-20", endDate: "2026-07-31" },
    ]);
  });

  it("clips a booking that starts before the window", () => {
    const occupied = [{ startDate: "2026-06-27", endDate: "2026-07-04" }];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([
      { startDate: "2026-07-04", endDate: "2026-07-31" },
    ]);
  });

  it("ignores a booking outside the window entirely", () => {
    const occupied = [{ startDate: "2026-09-01", endDate: "2026-09-08" }];
    expect(freePeriodsFrom({ windows: [JULY], occupied })).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-31" },
    ]);
  });

  it("never leaves the windows it was given", () => {
    const windows = [JULY, { start: "2026-09-01", end: "2026-09-30" }];
    const periods = freePeriodsFrom({ windows, occupied: [] });
    expect(periods).toEqual([
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      { startDate: "2026-09-01", endDate: "2026-09-30" },
    ]);
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

  it("writes the free stretches around the occupied ones", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
      now: () => RUN_AT,
    });

    const free = store.freeOf("ylst_marlin");
    expect(summary.freePeriods).toBe(free.length);
    /* The booking runs 2026-06-27 to 2026-07-04, so the free time is split either side. */
    expect(free).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-27" },
      { startDate: "2026-07-04", endDate: "2026-12-31" },
    ]);
    /* Availability is no longer asserted as charters, so no slot claims to be one. */
    expect(store.listOf("ylst_marlin", "available")).toEqual([]);
  });

  /* A boat with nothing left to sell has to lose the free periods it used to have. */
  it("leaves no free period for a listing that is booked solid", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () =>
          Promise.resolve([occupied({ startDate: "2026-01-01", endDate: "2026-12-31" })]),
      }),
      now: () => RUN_AT,
    });

    expect(store.freeOf("ylst_marlin")).toEqual([]);
  });

  it("records the vendor's confirmed, priced offer as a slot", async () => {
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

  it("reports each phase, and counts a scope once it is swept", async () => {
    const store = fakeStore({ yachts: { "4711001": MARLIN }, listings: { "102701": [MARLIN] } });
    const seen: AvailabilitySyncProgress[] = [];

    await runAvailabilitySync({
      store: store.store,
      source: source({
        scopes: [
          { scopeKey: "102701", year: 2026 },
          { scopeKey: "102702", year: 2026 },
        ],
        fetchOccupancy: () => Promise.resolve([occupied()]),
        searchConfirmed: async function* () {
          yield { offers: [], cursor: null };
        },
      }),
      onProgress: (progress) => seen.push({ ...progress }),
      now: () => RUN_AT,
    });

    // The first is emitted before listScopes answers, so the total is not known yet.
    expect(seen[0]).toEqual({ phase: "occupancy", scopeIndex: 0, scopeTotal: 0 });
    expect(seen).toContainEqual({ phase: "occupancy", scopeIndex: 2, scopeTotal: 2 });

    // The index stops climbing once the scopes are walked, so a later phase must not
    // be mistaken for occupancy still making progress.
    expect(seen.at(-1)).toEqual({ phase: "rebuild-search", scopeIndex: 2, scopeTotal: 2 });
    expect(seen.map((progress) => progress.phase)).toContain("confirmation");
  });

  it("still reports the phase it reached when the occupancy pass aborts", async () => {
    const store = fakeStore();
    const seen: AvailabilitySyncProgress[] = [];

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.reject(new AuthError("credential rejected")),
      }),
      onProgress: (progress) => seen.push({ ...progress }),
      now: () => RUN_AT,
    });

    expect(summary.aborted).toBe(true);
    // Nothing was swept, so nothing may claim to have been: a stalled run that
    // reported a scope done would send an operator looking in the wrong place.
    expect(seen.every((progress) => progress.scopeIndex === 0)).toBe(true);
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
    expect(summary.freePeriods).toBe(0);
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

  it("aborts the run on a contract failure by default", async () => {
    const store = fakeStore({ listings: { "102701": [MARLIN] } });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.reject(new ContractError("envelope drift")),
      }),
      now: () => RUN_AT,
    });

    expect(summary.aborted).toBe(true);
    expect(summary.sweptScopes).toBe(0);
  });

  /*
   * The bug this pins: one company-year of malformed rows discarded a whole run's
   * completed work, because the shared default reads a contract failure as a
   * prediction about every remaining call. It is that only for a vendor with one
   * envelope schema, which is the source's business to know, not the writer's.
   */
  it("costs a contract failure only its own scope when the source says it is not fatal", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { "102701": [MARLIN] },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        scopes: [
          { scopeKey: "102701", year: 2026 },
          { scopeKey: "102702", year: 2026 },
        ],
        fetchOccupancy: (scope) =>
          scope.scopeKey === "102701"
            ? Promise.reject(new ContractError("one malformed row"))
            : Promise.resolve([occupied()]),
        isFatal: isFatalAuthOnly,
      }),
      now: () => RUN_AT,
    });

    expect(summary.aborted).toBe(false);
    expect(summary.status).toBe("partial");
    expect(summary.failedCount).toBe(1);
    // The scope that answered was still swept, and the one that threw was not.
    expect(summary.sweptScopes).toBe(1);
    expect(summary.occupiedSlots).toBe(1);
  });

  it("still aborts for that source on an auth failure", async () => {
    const store = fakeStore({ listings: { "102701": [MARLIN] } });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () => Promise.reject(new AuthError("rejected")),
        isFatal: isFatalAuthOnly,
      }),
      now: () => RUN_AT,
    });

    expect(summary.aborted).toBe(true);
    expect(summary.sweptScopes).toBe(0);
  });

  /*
   * `skippedYachts` alone could not tell "a few boats we never imported" from "the
   * id spaces do not line up and nothing landed at all" - a production run reported
   * 123,600 skips and needed a database session to find out which.
   */
  it("samples the yacht ids it could not resolve, capped", async () => {
    const store = fakeStore({ listings: { "102701": [MARLIN] } });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        fetchOccupancy: () =>
          Promise.resolve(
            Array.from({ length: 25 }, (_unused, index) =>
              occupied({ externalYachtId: `unknown-${index}` }),
            ),
          ),
      }),
      now: () => RUN_AT,
    });

    expect(summary.skippedYachts).toBe(25);
    expect(summary.unresolvedYachtIdSample).toHaveLength(10);
    expect(summary.unresolvedYachtIdSample[0]).toBe("unknown-0");
  });

  /*
   * These two used to be a statement per boat: with the whole fleet arriving in one
   * scope that is tens of thousands of sequential round-trips, which is what made the
   * run slow once the HTTP fan-out was gone.
   */
  it("writes the whole scope's free periods in one batched call", async () => {
    const OTTER: ListingRef = { listingId: "ylst_otter", listingSourceId: "lsrc_otter" };
    const TERN: ListingRef = { listingId: "ylst_tern", listingSourceId: "lsrc_tern" };
    const store = fakeStore({ listings: { "102701": [MARLIN, OTTER, TERN] } });

    await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([]) }),
      now: () => RUN_AT,
    });

    expect(store.freePeriodBatchSizes).toEqual([3]);
    // Every listing still got its own periods, batching or not.
    for (const ref of [MARLIN, OTTER, TERN]) {
      expect(store.freeOf(ref.listingId)).not.toHaveLength(0);
    }
  });

  it("leaves a listing absent from the batch untouched", async () => {
    const RIVAL: ListingRef = { listingId: "ylst_rival", listingSourceId: "lsrc_rival" };
    const store = fakeStore({ listings: { "102701": [MARLIN] } });

    await runAvailabilitySync({
      store: store.store,
      source: source({ fetchOccupancy: () => Promise.resolve([]) }),
      now: () => RUN_AT,
    });

    expect(store.freeOf(RIVAL.listingId)).toHaveLength(0);
    expect(store.freeOf(MARLIN.listingId)).not.toHaveLength(0);
  });

  /*
   * A quarantined yacht is one whose dump the source could not read in full. The
   * rule is: never state what is free from a calendar we only partly have, and
   * never delete what we already hold from it either.
   */
  describe("quarantined yachts", () => {
    const seed = () =>
      fakeStore({ yachts: { "4711001": MARLIN }, listings: { "102701": [MARLIN] } });

    const quarantining = () =>
      source({
        fetchOccupancy: () =>
          Promise.resolve({
            intervals: [],
            quarantinedYachtIds: ["4711001"],
            issues: ["row 7 ends before it starts"],
          }),
      });

    it("clears its free periods rather than leaving last run's on sale", async () => {
      const store = fakeStore({
        yachts: { "4711001": MARLIN },
        listings: { "102701": [MARLIN] },
      });

      // A clean run first, so there is something on sale to be left behind.
      await runAvailabilitySync({
        store: store.store,
        source: source({ fetchOccupancy: () => Promise.resolve([]) }),
        now: () => RUN_AT,
      });
      expect(store.freeOf("ylst_marlin")).not.toHaveLength(0);

      await runAvailabilitySync({
        store: store.store,
        source: quarantining(),
        now: () => RUN_AT,
      });

      expect(store.freeOf("ylst_marlin")).toEqual([]);
    });

    it("does not sweep its stored slots", async () => {
      const store = fakeStore({
        yachts: { "4711001": MARLIN },
        listings: { "102701": [MARLIN] },
        slots: [
          {
            listingId: "ylst_marlin",
            listingSourceId: "lsrc_marlin",
            startDate: "2026-06-27",
            endDate: "2026-07-04",
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
        source: quarantining(),
        now: () => RUN_AT,
      });

      // Deleting an occupied slot it could not re-derive would read as free time.
      expect(store.listOf("ylst_marlin")).toHaveLength(1);
      expect(summary.deletedSlots).toBe(0);
    });

    it("counts them and reports the vendor's rows as a partial run", async () => {
      const summary = await runAvailabilitySync({
        store: seed().store,
        source: quarantining(),
        now: () => RUN_AT,
      });

      expect(summary.quarantinedYachts).toBe(1);
      expect(summary.status).toBe("partial");
      expect(summary.aborted).toBe(false);
    });

    it("keeps sweeping and synthesizing for everyone else in the scope", async () => {
      const OTTER: ListingRef = { listingId: "ylst_otter", listingSourceId: "lsrc_otter" };
      const store = fakeStore({
        yachts: { "4711001": MARLIN, "4711002": OTTER },
        listings: { "102701": [MARLIN, OTTER] },
      });

      await runAvailabilitySync({
        store: store.store,
        source: source({
          fetchOccupancy: () =>
            Promise.resolve({ intervals: [], quarantinedYachtIds: ["4711001"] }),
        }),
        now: () => RUN_AT,
      });

      expect(store.freeOf("ylst_marlin")).toEqual([]);
      expect(store.freeOf("ylst_otter")).not.toHaveLength(0);
    });

    it("accepts a bare array from a source that quarantines nothing", async () => {
      const store = seed();

      const summary = await runAvailabilitySync({
        store: store.store,
        source: source({ fetchOccupancy: () => Promise.resolve([occupied()]) }),
        now: () => RUN_AT,
      });

      expect(summary.quarantinedYachts).toBe(0);
      expect(summary.occupiedSlots).toBe(1);
    });
  });

  it("lists every listing under the account-wide scope so the sweep stays whole", async () => {
    const store = fakeStore({
      yachts: { "4711001": MARLIN },
      listings: { [ACCOUNT_WIDE_SCOPE]: [MARLIN] },
    });

    const summary = await runAvailabilitySync({
      store: store.store,
      source: source({
        scopes: [{ scopeKey: ACCOUNT_WIDE_SCOPE, year: 2026 }],
        fetchOccupancy: () => Promise.resolve([occupied()]),
      }),
      now: () => RUN_AT,
    });

    expect(summary.sweptScopes).toBe(1);
    expect(summary.listingsTouched).toBe(1);
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

/*
 * The fake store above keys slots by exactly this triple, so it collapses duplicates
 * silently and can never reproduce what Postgres does with them. That is why a run
 * aborted in production while every test here passed. These test the collapse itself.
 */
describe("dedupeSlotsByPeriod", () => {
  const slot = (listingId: string, startDate: string, endDate: string, status: string) => ({
    listingId,
    startDate,
    endDate,
    status,
  });

  it("collapses two intervals that share one listing and period", () => {
    // An option and a reservation over the same week: ordinary vendor data, and
    // `ON CONFLICT DO UPDATE` rejects the whole statement over it.
    const deduped = dedupeSlotsByPeriod([
      slot("ylst_a", "2026-08-22", "2026-08-29", "option"),
      slot("ylst_a", "2026-08-22", "2026-08-29", "booked"),
    ]);

    expect(deduped).toHaveLength(1);
    // Last wins, matching what the upsert did when a pair straddled a chunk boundary.
    expect(deduped[0]?.status).toBe("booked");
  });

  it("keeps periods that differ in any part of the key", () => {
    const deduped = dedupeSlotsByPeriod([
      slot("ylst_a", "2026-08-22", "2026-08-29", "booked"),
      slot("ylst_b", "2026-08-22", "2026-08-29", "booked"),
      slot("ylst_a", "2026-08-29", "2026-09-05", "booked"),
      slot("ylst_a", "2026-08-22", "2026-08-23", "booked"),
    ]);

    expect(deduped).toHaveLength(4);
  });

  it("collapses two same-day blocks that widened onto the same day", () => {
    // A same-day SERVICE row is widened to the one day it describes, so two of them
    // on one boat on one day arrive as an identical pair.
    const deduped = dedupeSlotsByPeriod([
      slot("ylst_a", "2026-08-22", "2026-08-23", "service"),
      slot("ylst_a", "2026-08-22", "2026-08-23", "service"),
    ]);

    expect(deduped).toHaveLength(1);
  });

  it("preserves order of first appearance", () => {
    const deduped = dedupeSlotsByPeriod([
      slot("ylst_a", "2026-08-22", "2026-08-29", "booked"),
      slot("ylst_b", "2026-08-22", "2026-08-29", "booked"),
      slot("ylst_a", "2026-08-22", "2026-08-29", "option"),
    ]);

    expect(deduped.map((s) => s.listingId)).toEqual(["ylst_a", "ylst_b"]);
  });

  it("passes an empty batch through", () => {
    expect(dedupeSlotsByPeriod([])).toEqual([]);
  });
});
