import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { ContractError } from "../shared/errors";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import { BM_RESERVATION_STATUS, type RestAvailability } from "./endpoints";
import {
  createBookingManagerAvailabilitySource,
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

describe("createBookingManagerAvailabilitySource", () => {
  // SAFETY: listScopes only multiplies the configured companies by the configured
  // years, so the source never reaches the transport on this path.
  const client = {} as BookingManagerClient;

  it("produces one scope per company and year", async () => {
    const source = createBookingManagerAvailabilitySource({
      client,
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

  it("falls back to one account-wide scope per year without company ids", async () => {
    const source = createBookingManagerAvailabilitySource({ client, config, years: [2026] });

    expect(await source.listScopes()).toEqual([{ scopeKey: "*", year: 2026 }]);
  });
});
