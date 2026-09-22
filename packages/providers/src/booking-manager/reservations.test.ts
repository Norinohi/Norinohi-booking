import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

// provider.ts pulls in modules that read the server env at import time.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { unscopedCompanies } from "../shared/company-scope";
import { AuthError } from "../shared/errors";
import type { FetchLike } from "../shared/http-client";
import { SequentialQueue } from "../shared/queue";
import type { Database } from "../registry";
import { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { BookingManagerInventoryProvider } from "./provider";
import { listChangedBookingManagerReservations } from "./reservations";

const config: BookingManagerConfig = {
  baseUrl: "https://www.booking-manager.com/api/v2",
  apiToken: "t0ken",
  timeoutMs: 1000,
  syncTimeoutMs: 5000,
  minIntervalMs: 0,
  sweepConcurrency: 1,
  priceWeeksConcurrency: 4,
  optionSafetyMarginMinutes: 15,
  timeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "booking-manager:test",
};

/*
 * Real GET /reservation/{id} answers from company 225 (bank details dropped, crew-list tokens
 * redacted, client names scrubbed), kept as text so the 19-digit ids reach the exact parser.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** Pipo, 17-24.10.2026, charter side, as POST opened it: status 2 until 2026-09-25 11:59:26. */
const OPTION = fixture("reservation-225-option.json");
/** The same record after the DELETE: status 5. */
const CANCELLED = fixture("reservation-225-cancelled.json");
/** An agency-side option that expired on 2026-09-01 and still read 3 three weeks later. */
const EXPIRED = fixture("reservation-225-expired.json");

const PIPO = "8295147330000100225";
const EXPIRED_CHARTER = "8192659040000100225";
const EXPIRED_AGENCY = "8192658760000107113";

function scripted(answers: Record<string, () => Response>) {
  const asked: string[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    asked.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const id = url.pathname.split("/").at(-1) ?? "";
    const answer = answers[id];
    return answer ? answer() : new Response("Not found", { status: 404 });
  };
  const client = new BookingManagerClient({
    config,
    queue: new SequentialQueue(),
    fetchImpl,
    retry: { maxAttempts: 1, sleep: async () => {} },
  });
  return { client, asked };
}

const json = (body: string) => () =>
  new Response(body, { status: 200, headers: { "content-type": "application/json" } });

const BEFORE_EXPIRY = new Date("2026-09-22T12:00:00Z");
const AFTER_EXPIRY = new Date("2026-09-26T12:00:00Z");

describe("listChangedBookingManagerReservations", () => {
  it("reads each reservation we hold by id and states it in our terms", async () => {
    const { client, asked } = scripted({ [PIPO]: json(OPTION) });

    const states = await listChangedBookingManagerReservations(
      client,
      { reservationIds: [PIPO] },
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(asked).toEqual([`GET /api/v2/reservation/${PIPO}`]);
    expect(states).toEqual([
      {
        providerReservationId: PIPO,
        status: "option_held",
        providerStatus: "OPTION",
        externalYachtId: "207160073500225",
        checkIn: "2026-10-17",
        checkOut: "2026-10-24",
        priceMinor: 170_000,
        currency: "EUR",
      },
    ]);
  });

  it("reports a cancelled record as cancelled, not as an expiry", async () => {
    const { client } = scripted({ [PIPO]: json(CANCELLED) });

    const [state] = await listChangedBookingManagerReservations(
      client,
      { reservationIds: [PIPO] },
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(state).toMatchObject({ status: "cancelled", providerStatus: "CANCELLED" });
    expect(state?.lapsed).toBeUndefined();
  });

  it("reads status 3 as a lapsed hold, on the agency twin's charter id too", async () => {
    const { client } = scripted({ [EXPIRED_CHARTER]: json(EXPIRED) });

    const [state] = await listChangedBookingManagerReservations(
      client,
      { reservationIds: [EXPIRED_CHARTER] },
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(state).toMatchObject({
      providerReservationId: EXPIRED_CHARTER,
      status: "cancelled",
      providerStatus: "OPTION_EXPIRED",
      lapsed: true,
      externalYachtId: "978990020000100225",
    });
  });

  it("reads an option past its expirationDate as lapsed although it still says 2", async () => {
    const { client } = scripted({ [PIPO]: json(OPTION) });

    const [state] = await listChangedBookingManagerReservations(
      client,
      { reservationIds: [PIPO] },
      { timeZone: config.timeZone, now: AFTER_EXPIRY },
    );

    expect(state).toMatchObject({ status: "cancelled", providerStatus: "OPTION", lapsed: true });
  });

  it("leaves out a record that answers for another reservation", async () => {
    const { client } = scripted({ [EXPIRED_AGENCY]: json(OPTION) });

    const states = await listChangedBookingManagerReservations(
      client,
      { reservationIds: [EXPIRED_AGENCY] },
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(states).toEqual([]);
  });

  it("skips one reservation the vendor cannot find and still answers for the rest", async () => {
    const { client, asked } = scripted({ [PIPO]: json(OPTION) });

    const states = await listChangedBookingManagerReservations(
      client,
      { reservationIds: ["8000000000000100225", PIPO, PIPO] },
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(asked).toHaveLength(2);
    expect(states.map((state) => state.providerReservationId)).toEqual([PIPO]);
  });

  it("fails the pass when the key is refused, so the reconcile reports the vendor unreachable", async () => {
    const { client } = scripted({ [PIPO]: () => new Response("Unauthorized", { status: 401 }) });

    await expect(
      listChangedBookingManagerReservations(
        client,
        { reservationIds: [PIPO] },
        { timeZone: config.timeZone, now: BEFORE_EXPIRY },
      ),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("asks nothing without ids", async () => {
    const { client, asked } = scripted({});

    const states = await listChangedBookingManagerReservations(
      client,
      {},
      { timeZone: config.timeZone, now: BEFORE_EXPIRY },
    );

    expect(states).toEqual([]);
    expect(asked).toEqual([]);
  });
});

/* The reconcile asks any adapter that has the method, so having it is what enrols the vendor. */
describe("BookingManagerInventoryProvider.listChangedReservations", () => {
  it("asks the vendor by id and reads expiry against the pass's own clock", async () => {
    const { client, asked } = scripted({ [PIPO]: json(OPTION) });
    // SAFETY: reading reservations touches the client only; nothing reaches the database.
    const provider = new BookingManagerInventoryProvider({ db: {} as Database, config, client });

    const [state] = await provider.listChangedReservations({
      since: new Date("2026-09-01T00:00:00Z"),
      until: AFTER_EXPIRY,
      reservationIds: [PIPO],
    });

    expect(asked).toEqual([`GET /api/v2/reservation/${PIPO}`]);
    expect(state).toMatchObject({ providerReservationId: PIPO, lapsed: true });
  });
});
