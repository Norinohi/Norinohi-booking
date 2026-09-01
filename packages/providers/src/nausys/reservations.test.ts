import { describe, expect, it } from "vitest";

import { unscopedCompanies } from "../shared/company-scope";
import { SequentialQueue } from "../shared/queue";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import { listChangedNausysReservations } from "./reservations";
import { FakeNausysTransport } from "./testing/fake-transport";

const config: NausysConfig = {
  baseUrl: "https://ws-test.nausys.com",
  username: "agency-user",
  password: "hunter2",
  timeoutMs: 1000,
  syncTimeoutMs: 1000,
  minIntervalMs: 0,
  optionSafetyMarginMinutes: 15,
  optionTimeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "nausys:agency-user",
};

function build() {
  const transport = new FakeNausysTransport();
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });

  return { client, transport };
}

const RESERVATION = {
  id: 920_307_162,
  uuid: "c8abecc7-965c-57f0-9023-9bb4c7695d51",
  reservationStatus: "RESERVATION",
  yachtId: 74_197_399,
  periodFrom: "19.09.2026 17:00",
  periodTo: "26.09.2026 08:00",
  clientPrice: "3340.00",
  currency: "EUR",
  lastModifiedAt: "22.08.2026 14:59",
};

const window = {
  since: new Date("2026-08-01T00:00:00.000Z"),
  until: new Date("2026-08-31T00:00:00.000Z"),
};

describe("the operator's own change feed", () => {
  /*
   * The window is stated in the vendor's wall clock, not ours. Sending UTC would ask for the
   * wrong two hours of a summer day, which is how a change at the edge goes unseen.
   */
  it("asks in the vendor's own time zone", async () => {
    const { client, transport } = build();
    transport.respondWith("reservations", { status: "OK", reservations: [] });

    await listChangedNausysReservations(client, window, "Europe/Zagreb");

    expect(transport.lastBody("reservations")).toMatchObject({
      modifyTimeFrom: "01.08.2026 02:00",
      modifyTimeTo: "31.08.2026 02:00",
    });
  });

  it("reads a reservation into our own vocabulary", async () => {
    const { client, transport } = build();
    transport.respondWith("reservations", { status: "OK", reservations: [RESERVATION] });

    const [state] = await listChangedNausysReservations(client, window, "Europe/Zagreb");

    expect(state).toEqual({
      providerReservationId: "920307162",
      status: "confirmed",
      providerStatus: "RESERVATION",
      securityToken: "c8abecc7-965c-57f0-9023-9bb4c7695d51",
      checkIn: "2026-09-19",
      checkOut: "2026-09-26",
      priceMinor: 334_000,
      currency: "EUR",
      lastModifiedAt: "2026-08-22T12:59:00.000Z",
    });
  });

  /* The one the pass exists for: a charter the operator called off in their own system. */
  it("reads a storno as a cancellation", async () => {
    const { client, transport } = build();
    transport.respondWith("reservations", {
      status: "OK",
      reservations: [{ ...RESERVATION, reservationStatus: "STORNO" }],
    });

    const [state] = await listChangedNausysReservations(client, window, "Europe/Zagreb");

    expect(state).toMatchObject({ status: "cancelled", providerStatus: "STORNO" });
  });

  /* Anything that is neither confirmed nor cancelled is a hold, which is the safe reading. */
  it("reads an option as a hold", async () => {
    const { client, transport } = build();
    transport.respondWith("reservations", {
      status: "OK",
      reservations: [{ ...RESERVATION, reservationStatus: "OPTION" }],
    });

    const [state] = await listChangedNausysReservations(client, window, "Europe/Zagreb");

    expect(state).toMatchObject({ status: "option_held", providerStatus: "OPTION" });
  });

  it("carries no price where the vendor priced it in nothing", async () => {
    const { client, transport } = build();
    const { currency: _currency, ...priced } = RESERVATION;
    transport.respondWith("reservations", { status: "OK", reservations: [priced] });

    const [state] = await listChangedNausysReservations(client, window, "Europe/Zagreb");

    expect(state?.priceMinor).toBeUndefined();
  });

  it("answers with nothing when the operator changed nothing", async () => {
    const { client, transport } = build();
    transport.respondWith("reservations", { status: "OK" });

    await expect(listChangedNausysReservations(client, window, "Europe/Zagreb")).resolves.toEqual(
      [],
    );
  });
});
