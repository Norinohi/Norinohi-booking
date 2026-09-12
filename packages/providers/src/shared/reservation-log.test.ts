import { providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "../registry";
import {
  createReservationEventRecorder,
  recordReservationEvent,
  type ReservationEventWriter,
  sanitizeReservationPayload,
} from "./reservation-log";

type ReservationEventRow = typeof providerReservationEvent.$inferInsert;

function fakeWriter() {
  const rows: ReservationEventRow[] = [];
  const db: ReservationEventWriter = {
    insert: () => ({
      values: (value) => {
        rows.push(value);
        return Promise.resolve();
      },
    }),
  };
  return { db, rows };
}

describe("sanitizeReservationPayload", () => {
  it("drops credentials and the whole client subtree", () => {
    const sanitized = sanitizeReservationPayload({
      credentials: { username: "agency-user", password: "hunter2" },
      id: 55901234,
      uuid: "7c2a9e55",
      client: { name: "Ana", surname: "Horvat", email: "ana@example.com" },
    });

    expect(sanitized).toEqual({ id: 55901234, uuid: "7c2a9e55" });
  });

  it("drops crew and passenger PII however the key is spelled", () => {
    const sanitized = sanitizeReservationPayload({
      crewList: [{ name: "Ana" }],
      date_of_birth: "01.01.1990",
      "passport-number": "X1234567",
      MOBILE: "+385 91 000 0000",
      periodFrom: "04.07.2026",
    });

    expect(sanitized).toEqual({ periodFrom: "04.07.2026" });
  });

  it("recurses into arrays and nested objects", () => {
    expect(
      sanitizeReservationPayload({
        services: [{ serviceId: 8001, amount: "150.00", contact: { email: "x@example.com" } }],
      }),
    ).toEqual({ services: [{ serviceId: 8001, amount: "150.00" }] });
  });
});

describe("recordReservationEvent", () => {
  it("writes a sanitized payload with a null provider reference by default", async () => {
    const { db, rows } = fakeWriter();

    await recordReservationEvent(db, {
      bookingId: "bkg_1",
      kind: "option_created",
      provider: "nausys",
      payload: {
        reservation: { id: 55901234, client: { email: "ana@example.com" } },
      },
    });

    expect(rows).toEqual([
      {
        bookingId: "bkg_1",
        kind: "option_created",
        provider: "nausys",
        providerReference: null,
        payload: { reservation: { id: 55901234 } },
      },
    ]);
  });

  it("stores a null payload when none is supplied", async () => {
    const { db, rows } = fakeWriter();
    await recordReservationEvent(db, {
      bookingId: "bkg_1",
      kind: "cancel_requested",
      provider: "nausys",
      providerReference: "55901234",
    });

    expect(rows[0]).toMatchObject({ providerReference: "55901234", payload: null });
  });
});

/**
 * Enough of the Drizzle executor for the recorder, with the booking lookup under the test's
 * control: the bug this guards was a lookup that never matched, and a stub that always finds
 * a booking cannot see it.
 */
function fakeDb(found: { id: string } | undefined) {
  const rows: ReservationEventRow[] = [];
  // SAFETY: a stub with nothing behind it. Only the two builders the recorder reaches for
  // exist, so any other Drizzle call is a TypeError rather than a quietly wrong answer.
  const db = Object.assign({} as Database, {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(found ? [found] : []) }) }),
    }),
    insert: () => ({
      values: (value: ReservationEventRow) => {
        rows.push(value);
        return Promise.resolve();
      },
    }),
  });

  return { db, rows };
}

describe("createReservationEventRecorder", () => {
  it("writes the event against the booking that holds the quote", async () => {
    const { db, rows } = fakeDb({ id: "bkg_1" });

    await createReservationEventRecorder(
      db,
      "nausys",
    )({
      quoteId: "qte_1",
      kind: "info_created",
      providerReference: "921616844",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        bookingId: "bkg_1",
        kind: "info_created",
        provider: "nausys",
        providerReference: "921616844",
      }),
    ]);
  });

  /*
   * Dropping the row stays correct -- reconciliation and admin tooling drive these with no
   * booking behind them -- but it may not be quiet. A quote id from the wrong id space matched
   * nothing for a month of checkouts and nothing anywhere said so.
   */
  it("says so when no booking holds the quote, rather than dropping it in silence", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, rows } = fakeDb(undefined);

    await createReservationEventRecorder(
      db,
      "nausys",
    )({
      quoteId: "nausys_8228780_d11155dee",
      kind: "info_created",
    });

    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("nausys_8228780_d11155dee"));
    warn.mockRestore();
  });
});
