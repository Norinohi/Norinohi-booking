import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { AuthError, ContractError, TransientError } from "../shared/errors";
import type { QueryValue } from "../shared/http-client";
import { ACCOUNT_WIDE_SCOPE } from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import { BM_RESERVATION_STATUS, type RestAvailability } from "./endpoints";
import {
  createBookingManagerAvailabilitySource,
  fetchBookingManagerOccupancy,
  mapBookingManagerAvailability,
  mapBookingManagerOccupancyDump,
} from "./occupancy";

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 4,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

/*
 * Ids are digit strings, which is what the client's parser produces: the vendor's
 * run to 19 digits and `JSON.parse` would round them. A real one is used below so the
 * fixtures cannot drift back to a shape a float64 could hold.
 */
const row = (over: Partial<RestAvailability> = {}): RestAvailability => ({
  id: "1",
  yachtId: "6614004890000100225",
  dateFrom: "2026-08-08 17:00:00",
  dateTo: "2026-08-15 09:00:00",
  status: BM_RESERVATION_STATUS.RESERVATION,
  baseFromId: "3",
  baseToId: "3",
  optionExpirationDate: null,
  ...over,
});

describe("mapBookingManagerAvailability", () => {
  it("maps a reservation to an occupied half-open interval", () => {
    expect(mapBookingManagerAvailability(row(), config)).toMatchObject({
      // Intact, not the 6614004890000100000 a float64 would have left.
      externalYachtId: "6614004890000100225",
      startDate: "2026-08-08",
      endDate: "2026-08-15",
      status: "occupied",
    });
  });

  it.each([
    [BM_RESERVATION_STATUS.RESERVATION, "occupied"],
    [BM_RESERVATION_STATUS.OPTION, "option"],
    [BM_RESERVATION_STATUS.OPTION_IN_EXPIRATION, "option"],
    // A vendor maintenance or delivery block is not a sale.
    [BM_RESERVATION_STATUS.SERVICE, "blocked"],
  ])("maps status %i to %s", (status, expected) => {
    expect(mapBookingManagerAvailability(row({ status }), config).status).toBe(expected);
  });

  it.each([undefined, null, 99])(
    "falls back to blocked for undocumented status %o rather than throwing",
    (status) => {
      // The row still came from a feed listing only taken periods, so blocked is
      // the reading that cannot oversell if the vendor adds a fifth state.
      expect(mapBookingManagerAvailability(row({ status }), config).status).toBe("blocked");
    },
  );

  it("widens a same-day block to the one day it describes", () => {
    // Half-open intervals make startDate === endDate overlap nothing, which would
    // advertise a maintenance day as free.
    expect(
      mapBookingManagerAvailability(
        row({
          dateFrom: "2026-08-08 00:00:00",
          dateTo: "2026-08-08 00:00:00",
          status: BM_RESERVATION_STATUS.SERVICE,
        }),
        config,
      ),
    ).toMatchObject({ startDate: "2026-08-08", endDate: "2026-08-09", status: "blocked" });
  });

  it("rejects a genuinely inverted interval", () => {
    expect(() =>
      mapBookingManagerAvailability(
        row({ dateFrom: "2026-08-15 00:00:00", dateTo: "2026-08-08 00:00:00" }),
        config,
      ),
    ).toThrow(ContractError);
  });

  it("changes the source hash when only the option deadline moves", () => {
    const base = mapBookingManagerAvailability(
      row({ optionExpirationDate: "2026-08-01 12:00:00" }),
      config,
    );
    const moved = mapBookingManagerAvailability(
      row({ optionExpirationDate: "2026-08-02 12:00:00" }),
      config,
    );
    expect(base.sourceHash).not.toBe(moved.sourceHash);
  });

  it("fails the scope on a malformed deadline rather than dropping it", () => {
    expect(() =>
      mapBookingManagerAvailability(row({ optionExpirationDate: "not a date" }), config),
    ).toThrow(ContractError);
  });
});

describe("mapBookingManagerOccupancyDump", () => {
  it("maps every row", () => {
    expect(
      mapBookingManagerOccupancyDump([row({ id: "1" }), row({ id: "2" })], config).intervals,
    ).toHaveLength(2);
  });

  it("quarantines nothing when the dump is clean", () => {
    const dump = mapBookingManagerOccupancyDump([row()], config);

    expect(dump.quarantinedYachtIds).toBeUndefined();
    expect(dump.issues).toBeUndefined();
  });

  /*
   * Measured on the live account 2026-08-19: one row of 239,444 carried
   * dateFrom=2027-10-30 with dateTo=2026-03-25, and under the old all-or-nothing
   * mapping it failed the scope - which account-wide means every company.
   */
  it("quarantines the yacht that owns an unreadable row, not the scope", () => {
    const dump = mapBookingManagerOccupancyDump(
      [
        row({ yachtId: "42" }),
        row({ yachtId: "99", dateFrom: "2027-10-30 00:00:00", dateTo: "2026-03-25 00:00:00" }),
      ],
      config,
    );

    expect(dump.intervals.map((interval) => interval.externalYachtId)).toEqual(["42"]);
    expect(dump.quarantinedYachtIds).toEqual(["99"]);
    expect(dump.issues?.[0]).toContain("before it starts");
  });

  it("drops a quarantined yacht's readable rows too", () => {
    const dump = mapBookingManagerOccupancyDump(
      [
        row({ yachtId: "99", id: "1" }),
        row({
          yachtId: "99",
          id: "2",
          dateFrom: "2027-10-30 00:00:00",
          dateTo: "2026-03-25 00:00:00",
        }),
      ],
      config,
    );

    // Half a calendar is not a calendar: partial occupancy plus no sweep would leave
    // the rest of its slots stale with nothing to tidy them.
    expect(dump.intervals).toEqual([]);
    expect(dump.quarantinedYachtIds).toEqual(["99"]);
  });

  it("caps the reported issues", () => {
    const bad = (yachtId: string) =>
      row({ yachtId, dateFrom: "2027-10-30 00:00:00", dateTo: "2026-03-25 00:00:00" });
    const dump = mapBookingManagerOccupancyDump(
      Array.from({ length: 9 }, (_unused, index) => bad(String(index))),
      config,
    );

    expect(dump.quarantinedYachtIds).toHaveLength(9);
    expect(dump.issues).toHaveLength(5);
  });
});

type OccupancyQuery = Record<string, QueryValue | undefined>;

interface RecordedCall {
  endpoint: string;
  query: OccupancyQuery | undefined;
}

/**
 * Captures what actually reaches the transport, which nothing here used to do.
 *
 * The name is load-bearing and is NOT the one the spec documents: `?company=` is
 * accepted and ignored by the live endpoint, returning the whole account, while
 * `?companyId=` filters. See the comment in `fetchBookingManagerOccupancy`. A
 * silently-widened scope looks like success, so this is asserted rather than trusted.
 */
function recordingClient(rows: RestAvailability[] = []) {
  const calls: RecordedCall[] = [];
  // SAFETY: a stub with nothing behind it; any method these paths do not use is
  // absent, so reaching for one is a TypeError rather than a wrong answer.
  const client = Object.assign({} as BookingManagerClient, {
    get: (endpoint: string, _schema: z.ZodType<RestAvailability[]>, query?: OccupancyQuery) => {
      calls.push({ endpoint, query });
      return Promise.resolve(rows);
    },
  });
  return { client, calls };
}

describe("fetchBookingManagerOccupancy", () => {
  it("narrows by `companyId`, the name the live endpoint honours", async () => {
    const { client, calls } = recordingClient();

    await fetchBookingManagerOccupancy(client, { companyId: "10", year: 2026 });

    expect(calls).toEqual([{ endpoint: "availability/2026", query: { companyId: "10" } }]);
  });

  it("sends no filter at all for the account-wide scope", async () => {
    const { client, calls } = recordingClient();

    await fetchBookingManagerOccupancy(client, { companyId: ACCOUNT_WIDE_SCOPE, year: 2026 });

    expect(calls).toEqual([{ endpoint: "availability/2026", query: undefined }]);
  });
});

describe("createBookingManagerAvailabilitySource", () => {
  it("sweeps the whole account in one scope per year when no allowlist is configured", async () => {
    const source = createBookingManagerAvailabilitySource({
      client: recordingClient().client,
      config,
      years: [2026, 2027],
    });

    expect(await source.listScopes()).toEqual([
      { scopeKey: ACCOUNT_WIDE_SCOPE, year: 2026 },
      { scopeKey: ACCOUNT_WIDE_SCOPE, year: 2027 },
    ]);
  });

  it("narrows to one scope per company and year when an allowlist is configured", async () => {
    const source = createBookingManagerAvailabilitySource({
      client: recordingClient().client,
      config,
      years: [2026, 2027],
      companyIds: [10, 20],
    });

    expect(await source.listScopes()).toEqual([
      { scopeKey: "10", year: 2026 },
      { scopeKey: "10", year: 2027 },
      { scopeKey: "20", year: 2026 },
      { scopeKey: "20", year: 2027 },
    ]);
  });

  it("costs one call per year, not one per company, without an allowlist", async () => {
    const { client, calls } = recordingClient([row()]);
    const source = createBookingManagerAvailabilitySource({ client, config, years: [2026, 2027] });

    for (const scope of await source.listScopes()) {
      await source.fetchOccupancy(scope);
    }

    expect(calls).toEqual([
      { endpoint: "availability/2026", query: undefined },
      { endpoint: "availability/2027", query: undefined },
    ]);
  });

  it("maps the fetched dump", async () => {
    const { client } = recordingClient([row()]);
    const source = createBookingManagerAvailabilitySource({ client, config, years: [2026] });

    await expect(
      source.fetchOccupancy({ scopeKey: ACCOUNT_WIDE_SCOPE, year: 2026 }),
    ).resolves.toEqual({
      intervals: [
        expect.objectContaining({ externalYachtId: "6614004890000100225", status: "occupied" }),
      ],
    });
  });

  describe("isFatal", () => {
    const source = createBookingManagerAvailabilitySource({
      client: recordingClient().client,
      config,
      years: [2026],
    });

    it("stops the run only for a credential failure", () => {
      expect(source.isFatal?.(new AuthError("rejected"))).toBe(true);
    });

    // The regression: one malformed row used to discard a whole run's completed work.
    it.each([
      ["contract", new ContractError("schema drift")],
      ["transient", new TransientError("gateway hiccup")],
    ])("lets a %s failure cost its own scope-year", (_label, error) => {
      expect(source.isFatal?.(error)).toBe(false);
    });
  });
});
