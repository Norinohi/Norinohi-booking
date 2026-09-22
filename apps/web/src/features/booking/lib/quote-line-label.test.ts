import { describe, expect, it } from "vitest";

import { quoteLineLabel, type QuoteLineKey } from "./quote-line-label";

const t = (key: QuoteLineKey) => `<${key}>`;

describe("quoteLineLabel", () => {
  it("keeps a Booking Manager discount's own name beside ours", () => {
    expect(
      quoteLineLabel({ code: "bm-discount-8294180160000100225", label: "Early booking 2027" }, t),
    ).toBe("<provider-discount> (Early booking 2027)");
  });

  it("keeps a NauSYS discount's own name beside ours", () => {
    expect(quoteLineLabel({ code: "nausys-discount-17", label: "Early booking" }, t)).toBe(
      "<provider-discount> (Early booking)",
    );
  });

  it("translates an unnamed discount alone", () => {
    expect(quoteLineLabel({ code: "bm-discount", label: "Charter discount" }, t)).toBe(
      "<provider-discount>",
    );
    expect(quoteLineLabel({ code: "bm-discount-1", label: "Charter discount" }, t)).toBe(
      "<provider-discount>",
    );
  });

  it("prints any other line as it came", () => {
    expect(quoteLineLabel({ code: "service:77", label: "Final cleaning" }, t)).toBe(
      "Final cleaning",
    );
  });
});
