import { describe, expect, it } from "vitest";

import { classifyRefusal, type RefusalAttempt } from "./refusal-report";

const declined: RefusalAttempt = {
  outcome: "unavailable",
  providerCode: "nausys",
  reason: "SlotUnavailableError",
};
const crashed: RefusalAttempt = {
  outcome: "error",
  providerCode: "nausys",
  reason: 'Unknown NauSYS calculationType "INCLUDED_IN_PRICE" on extra service:52',
};

describe("classifyRefusal", () => {
  it("blames the vendor when every offer simply declined", () => {
    expect(classifyRefusal([declined]).blame).toBe("vendor");
  });

  it("blames us when an adapter errored, which is the case that does not self-correct", () => {
    expect(classifyRefusal([crashed]).blame).toBe("ours");
  });

  it("blames us when a vendor timed out rather than answering", () => {
    expect(
      classifyRefusal([{ outcome: "timeout", providerCode: "booking_manager", reason: "timeout" }])
        .blame,
    ).toBe("ours");
  });

  /* One vendor declining is ordinary; the other crashing is still ours to fix. */
  it("blames us when one of several offers errored", () => {
    expect(classifyRefusal([declined, crashed]).blame).toBe("ours");
  });

  it("blames the vendor when no offer was even eligible to ask", () => {
    expect(
      classifyRefusal([
        {
          outcome: "ineligible",
          providerCode: "nausys",
          reason: "published constraints refuse the range",
        },
      ]).blame,
    ).toBe("vendor");
  });

  it("says so when there was nothing to ask at all", () => {
    expect(classifyRefusal([])).toEqual({ blame: "vendor", said: "no offer answered" });
  });

  it("names every vendor and its answer, which is what makes the line worth reading", () => {
    expect(classifyRefusal([declined, crashed]).said).toBe(
      'nausys:unavailable(SlotUnavailableError), nausys:error(Unknown NauSYS calculationType "INCLUDED_IN_PRICE" on extra service:52)',
    );
  });
});
