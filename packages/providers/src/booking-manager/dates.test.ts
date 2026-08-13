import { describe, expect, it } from "vitest";

import { ContractError } from "../shared/errors";
import {
  formatBookingManagerDateTime,
  parseBookingManagerDate,
  parseBookingManagerDateTime,
} from "./dates";

const ZONE = "Europe/Zagreb";

describe("parseBookingManagerDateTime", () => {
  // MMK support confirmed responses come back space-separated, never with a `T`,
  // so the space form is the one that actually has to work in production.
  it("reads the space-separated form the vendor returns", () => {
    expect(parseBookingManagerDateTime("2026-08-08 17:00:00", ZONE).toISOString()).toBe(
      "2026-08-08T15:00:00.000Z",
    );
  });

  it("also reads the T form we send", () => {
    expect(parseBookingManagerDateTime("2026-08-08T17:00:00", ZONE).toISOString()).toBe(
      "2026-08-08T15:00:00.000Z",
    );
  });

  it("applies daylight saving rather than a fixed +01:00", () => {
    // Winter reads as +01:00, summer as +02:00. A fixed offset would make one of
    // these an hour wrong, which is the bug the vendor answer rules out.
    expect(parseBookingManagerDateTime("2026-01-15 12:00:00", ZONE).toISOString()).toBe(
      "2026-01-15T11:00:00.000Z",
    );
    expect(parseBookingManagerDateTime("2026-07-15 12:00:00", ZONE).toISOString()).toBe(
      "2026-07-15T10:00:00.000Z",
    );
  });

  it("resolves an ambiguous fall-back clock to the earlier instant", () => {
    // 02:30 on 2026-10-25 happens twice in Europe/Zagreb. Reading a deadline late
    // is what lets us sell a slot the provider already released.
    expect(parseBookingManagerDateTime("2026-10-25 02:30:00", ZONE).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("pushes a non-existent spring-forward clock past the gap", () => {
    // 02:30 on 2026-03-29 never happens; the only sane answer is just after it.
    expect(parseBookingManagerDateTime("2026-03-29 02:30:00", ZONE).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("accepts a missing seconds field", () => {
    expect(parseBookingManagerDateTime("2026-08-08 17:00", ZONE).toISOString()).toBe(
      "2026-08-08T15:00:00.000Z",
    );
  });

  it.each(["", "08.08.2026 17:00:00", "2026-13-01 00:00:00", "2026-02-30 00:00:00", "not a date"])(
    "rejects %o",
    (value) => {
      expect(() => parseBookingManagerDateTime(value, ZONE)).toThrow(ContractError);
    },
  );

  it("rejects a non-string", () => {
    expect(() => parseBookingManagerDateTime(42, ZONE)).toThrow(ContractError);
  });
});

describe("parseBookingManagerDate", () => {
  it("takes the calendar date off a full timestamp", () => {
    expect(parseBookingManagerDate("2026-08-08 17:00:00")).toBe("2026-08-08");
  });

  it("passes a bare date through", () => {
    expect(parseBookingManagerDate("2026-08-08")).toBe("2026-08-08");
  });

  it("rejects an impossible day", () => {
    expect(() => parseBookingManagerDate("2026-02-30")).toThrow(ContractError);
  });
});

describe("formatBookingManagerDateTime", () => {
  // The vendor rejects a call without seconds, and /offers requires midnight so
  // it can substitute the base's real check-in time.
  it("defaults to midnight with explicit seconds", () => {
    expect(formatBookingManagerDateTime("2026-08-08")).toBe("2026-08-08T00:00:00");
  });

  it("uses a literal T, not the space the vendor answers with", () => {
    expect(formatBookingManagerDateTime("2026-08-08", "17:00:00")).toBe("2026-08-08T17:00:00");
  });

  it("pads a time given without seconds", () => {
    expect(formatBookingManagerDateTime("2026-08-08", "09:30")).toBe("2026-08-08T09:30:00");
  });

  it("rejects a malformed date", () => {
    expect(() => formatBookingManagerDateTime("08.08.2026")).toThrow(ContractError);
  });

  it("rejects a malformed time", () => {
    expect(() => formatBookingManagerDateTime("2026-08-08", "25:00:00")).toThrow(ContractError);
  });
});
