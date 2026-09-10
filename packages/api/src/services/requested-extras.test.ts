import { describe, expect, it } from "vitest";

import { appendRequestedExtras } from "./requested-extras";

/*
 * The special-requests field is where an extra no vendor sells through us lands, so what it
 * says has to survive beside whatever the guest wrote there themselves.
 */
describe("appendRequestedExtras", () => {
  it("keeps the guest's own note when nothing was asked for", () => {
    expect(appendRequestedExtras("Late arrival, around 20:00", [])).toBe(
      "Late arrival, around 20:00",
    );
  });

  it("returns null for an empty note and no requests", () => {
    expect(appendRequestedExtras("   ", [])).toBeNull();
    expect(appendRequestedExtras(undefined, [])).toBeNull();
  });

  it("adds the asked-for extras below the guest's note", () => {
    expect(appendRequestedExtras("Late arrival", ["SUP board", "Barbecue"])).toBe(
      "Late arrival\n\nRequested from the base: SUP board, Barbecue",
    );
  });

  it("stands alone when the guest wrote nothing", () => {
    expect(appendRequestedExtras(undefined, ["SUP board"])).toBe(
      "Requested from the base: SUP board",
    );
  });

  /* A code the catalogue stopped carrying resolves to no name, and a resync between the quote
     and the booking is not the customer's to explain. */
  it("says nothing when no code resolved to a name", () => {
    expect(appendRequestedExtras("Late arrival", [])).toBe("Late arrival");
  });
});
