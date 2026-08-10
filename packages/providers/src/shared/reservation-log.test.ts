import { describe, expect, it } from "vitest";

import {
  recordReservationEvent,
  type ReservationEventWriter,
  sanitizeReservationPayload,
} from "./reservation-log";

function fakeWriter() {
  const rows: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        rows.push(value);
        return Promise.resolve();
      },
    }),
  } as unknown as ReservationEventWriter;
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
