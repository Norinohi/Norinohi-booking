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
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

const row = (over: Partial<RestAvailability> = {}): RestAvailability => ({
  id: 1,
  yachtId: 42,
  dateFrom: "2026-08-08 17:00:00",
  dateTo: "2026-08-15 09:00:00",
  status: BM_RESERVATION_STATUS.RESERVATION,
  baseFromId: 3,
  baseToId: 3,
  optionExpirationDate: null,
  ...over,
});

describe("mapBookingManagerAvailability", () => {
  it("maps a reservation to an occupied half-open interval", () => {
    expect(mapBookingManagerAvailability(row(), config)).toMatchObject({
      externalYachtId: "42",
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
    expect(mapBookingManagerOccupancyDump([row({ id: 1 }), row({ id: 2 })], config)).toHaveLength(
      2,
    );
  });
});

type OccupancyQuery = Record<string, QueryValue | undefined>;

interface RecordedCall {
  endpoint: string;
  query: OccupancyQuery | undefined;
}

/**
 * Captures what actually reaches the transport. The bug this guards against was
 * invisible for exactly as long as no test looked here: the vendor names the
 * company filter `company` on `/availability`, the connector sent `companyId`, and
 * an unknown query parameter is dropped rather than refused.
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
  it("narrows by `company`, the name the vendor documents on /availability", async () => {
    const { client, calls } = recordingClient();

    await fetchBookingManagerOccupancy(client, { companyId: "10", year: 2026 });

    expect(calls).toEqual([{ endpoint: "availability/2026", query: { company: "10" } }]);
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
    ).resolves.toMatchObject([{ externalYachtId: "42", status: "occupied" }]);
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
