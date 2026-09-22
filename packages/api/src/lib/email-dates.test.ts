import { describe, expect, it } from "vitest";

import { emailDay, emailInstant } from "./email-dates";

describe("emailInstant", () => {
  it("prints a hold's deadline to the minute in UTC, without throwing", () => {
    expect(emailInstant(new Date("2026-09-24T21:44:00.000Z"))).toBe("Sep 24, 2026, 21:44 UTC");
  });
});

describe("emailDay", () => {
  it("prints the calendar day of an ISO date", () => {
    expect(emailDay("2026-10-17")).toBe("Oct 17, 2026");
  });
});
