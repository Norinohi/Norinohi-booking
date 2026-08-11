import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AuthError,
  ContractError,
  NotFoundError,
  type ProviderError,
  type ProviderErrorOptions,
  TransientError,
} from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import {
  NAUSYS_STATUS_CODES,
  type NausysStatusName,
  nausysEndpoints,
  restCountriesResponseSchema,
  restFreeYachtsResponseSchema,
  restOccupancyResponseSchema,
  restYachtReservationResponseSchema,
} from "./endpoints";
import { FakeNausysTransport } from "./testing/fake-transport";

const config: NausysConfig = {
  baseUrl: "https://ws-test.nausys.com",
  username: "agency-user",
  password: "hunter2",
  timeoutMs: 1000,
  minIntervalMs: 0,
  optionSafetyMarginMinutes: 15,
  optionTimeZone: "Europe/Zagreb",
  queueKey: "nausys:agency-user",
};

function build(transport = new FakeNausysTransport()) {
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });
  return { client, transport };
}

type ErrorCtor = new (message: string, options?: ProviderErrorOptions) => ProviderError;

const EXPECTED_ERRORS: [NausysStatusName, ErrorCtor][] = [
  ["AUTHENTICATION_ERROR", AuthError],
  ["OPERATION_NOT_ALLOWED", AuthError],
  ["INSUFFICIENT_DATA", ContractError],
  ["INVALID_DATE_FORMAT", ContractError],
  ["INVALID_NUMBER_FORMAT", ContractError],
  ["INVALID_EMAIL_FORMAT", ContractError],
  ["CREW_LIST_LOCKED", ContractError],
  ["CREW_LIST_VALIDATION_FAILED", ContractError],
  ["INVALID_COUNTRY_ID", ContractError],
  ["INVALID_YACHT_ID", NotFoundError],
  ["WRONG_YACHT_OWNERSHIP", AuthError],
  ["NOT_ALLOWED_TO_BOOK_THIS_YACHT", AuthError],
  ["INVALID_PAYMENT_METHOD", AuthError],
  ["INVALID_CURRENCY", AuthError],
  ["UNKNOWN_ERROR", TransientError],
];

describe("NauSYS error classification", () => {
  it("covers every documented status code", () => {
    const mapped = new Set(EXPECTED_ERRORS.map(([name]) => name));
    const documented = Object.keys(NAUSYS_STATUS_CODES).filter((name) => name !== "OK");
    expect([...documented].filter((name) => !mapped.has(name as NausysStatusName))).toEqual([]);
  });

  it.each(EXPECTED_ERRORS)("maps %s to the right error class", async (name, ctor) => {
    const { client, transport } = build();
    transport.respondWith("countries", { status: name, errorCode: NAUSYS_STATUS_CODES[name] });

    const error = await client
      .catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ctor);
    expect((error as ProviderError).providerCode).toBe(name);
    expect((error as ProviderError).endpoint).toBe(nausysEndpoints.catalogue.countries);
  });

  it("retries only UNKNOWN_ERROR out of the whole table", () => {
    const retryable = EXPECTED_ERRORS.filter(([, ctor]) => new ctor("x", {}).retryable).map(
      ([name]) => name,
    );
    expect(retryable).toEqual(["UNKNOWN_ERROR"]);
  });

  it("falls back to ContractError for an undocumented status", async () => {
    const { client, transport } = build();
    transport.respondWith("countries", { status: "SOMETHING_NEW", errorCode: 777 });

    await expect(
      client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema),
    ).rejects.toBeInstanceOf(ContractError);
  });

  it("treats a response without a status field as a contract failure", async () => {
    const { client, transport } = build();
    transport.respondWith("countries", { countries: [] });

    await expect(
      client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema),
    ).rejects.toBeInstanceOf(ContractError);
  });

  it("still fails on an infrastructure HTTP status, before reading a vendor status", async () => {
    const { client, transport } = build();
    transport.respondWith("countries", "<html>maintenance</html>", 503);

    await expect(
      client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema),
    ).rejects.toBeInstanceOf(TransientError);
  });

  it("never leaks credentials into a thrown error", async () => {
    const { client, transport } = build();
    transport.failWith("createOption", "error-100");

    const error = await client
      .bookingCall(nausysEndpoints.booking.createOption, restYachtReservationResponseSchema, {
        id: 55901234,
        uuid: "0f1b7d4c",
      })
      .catch((err: unknown) => err);

    const serialized = JSON.stringify((error as ProviderError).sanitizedContext());
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("agency-user");
  });
});

describe("NauSYS auth body shapes", () => {
  it("puts credentials at the top level for catalogue calls", async () => {
    const { client, transport } = build();
    await client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema);

    expect(transport.lastBody("countries")).toEqual({
      username: "agency-user",
      password: "hunter2",
    });
  });

  it("uses the top-level shape for occupancy despite its yachtReservation path", async () => {
    const { client, transport } = build();
    const response = await client.catalogueCall(
      nausysEndpoints.availability.occupancy(102701, 2026),
      restOccupancyResponseSchema,
    );

    expect(transport.lastBody("occupancy")).toEqual({
      username: "agency-user",
      password: "hunter2",
    });
    expect(response.reservations?.[0]?.reservationType).toBe("RESERVATION");
  });

  it("nests credentials for reservation and booking calls", async () => {
    const { client, transport } = build();
    await client.bookingCall(
      nausysEndpoints.availability.freeYachts,
      restFreeYachtsResponseSchema,
      {
        periodFrom: "04.07.2026",
        periodTo: "11.07.2026",
        yachts: [4711001],
      },
    );

    expect(transport.lastBody("freeYachts")).toEqual({
      credentials: { username: "agency-user", password: "hunter2" },
      periodFrom: "04.07.2026",
      periodTo: "11.07.2026",
      yachts: [4711001],
    });
  });

  it("posts to the configured host and vendor path", async () => {
    const { client, transport } = build();
    await client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema);

    expect(transport.calls[0]?.url).toBe(
      "https://ws-test.nausys.com/CBMS-external/rest/catalogue/v6/countries",
    );
  });
});

describe("NauSYS fixture round trip", () => {
  it("parses the catalogue and availability fixtures", async () => {
    const { client } = build();

    const countries = await client.catalogueCall(
      nausysEndpoints.catalogue.countries,
      restCountriesResponseSchema,
    );
    expect(countries.countries?.[0]).toMatchObject({ code: "HRV", code2: "HR" });
    // Recorded countries are translated into 18 languages, English among them.
    expect(countries.countries?.[0]?.name.textEN).toBe("Croatia");

    const free = await client.bookingCall(
      nausysEndpoints.availability.freeYachts,
      restFreeYachtsResponseSchema,
      { periodFrom: "04.07.2026", periodTo: "11.07.2026", yachts: [4711001, 4711002] },
    );
    expect(free.freeYachts?.[0]?.price.clientPrice).toBe("3340.00");
    expect(free.freeYachts?.[1]?.status).toBe("UNDER_OPTION");
  });

  it("rotates the uuid across the mandatory three-step chain, one call at a time", async () => {
    const transport = new FakeNausysTransport({ delayMs: 2 });
    const { client } = build(transport);

    const info = await client.bookingCall(
      nausysEndpoints.booking.createInfo,
      restYachtReservationResponseSchema,
      {
        client: { name: "Ana" },
        periodFrom: "04.07.2026",
        periodTo: "11.07.2026",
        yachtID: 4711001,
      },
    );
    const option = await client.bookingCall(
      nausysEndpoints.booking.createOption,
      restYachtReservationResponseSchema,
      { id: info.id, uuid: info.uuid },
    );
    const booking = await client.bookingCall(
      nausysEndpoints.booking.createBooking,
      restYachtReservationResponseSchema,
      { id: option.id, uuid: option.uuid },
    );

    expect(transport.callSequence()).toEqual(["createInfo", "createOption", "createBooking"]);
    expect(transport.maxConcurrent).toBe(1);
    expect([info.reservationStatus, option.reservationStatus, booking.reservationStatus]).toEqual([
      "INFO",
      "OPTION",
      "RESERVATION",
    ]);
    expect(new Set([info.uuid, option.uuid, booking.uuid]).size).toBe(3);
    expect(option.optionTill).toBe("12.02.2026 18:00");
  });

  it("serializes concurrent calls on one credential", async () => {
    const transport = new FakeNausysTransport({ delayMs: 5 });
    const { client } = build(transport);

    await Promise.all([
      client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema),
      client.catalogueCall(
        nausysEndpoints.catalogue.regions,
        z.looseObject({ status: z.string() }),
      ),
      client.catalogueCall(
        nausysEndpoints.catalogue.locations,
        z.looseObject({ status: z.string() }),
      ),
    ]);

    expect(transport.maxConcurrent).toBe(1);
  });

  it("fails in the client when a response does not match the schema", async () => {
    const { client, transport } = build();
    transport.respondWith("countries", { status: "OK", countries: [{ id: "not-a-number" }] });

    await expect(
      client.catalogueCall(nausysEndpoints.catalogue.countries, restCountriesResponseSchema),
    ).rejects.toBeInstanceOf(ContractError);
  });
});
