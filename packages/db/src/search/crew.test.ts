import { describe, expect, it } from "vitest";

import { crewOptionsFor } from "./crew";

describe("crewOptionsFor", () => {
  it("offers a crewed yacht nothing but full crew", () => {
    expect(crewOptionsFor("full-crew", ["skipper", "hostess", "cook"])).toEqual(["full-crew"]);
  });

  it("never offers bareboat on a yacht sold with a skipper", () => {
    expect(crewOptionsFor("skipper", ["skipper"])).toEqual(["skipper"]);
    expect(crewOptionsFor("skipper", ["skipper", "cook"])).toEqual(["skipper", "full-crew"]);
  });

  it("offers a bareboat yacht only the roles it actually prices", () => {
    expect(crewOptionsFor("bareboat", [])).toEqual(["bareboat"]);
    expect(crewOptionsFor("bareboat", ["skipper"])).toEqual(["bareboat", "skipper"]);
    expect(crewOptionsFor("bareboat", ["skipper", "hostess"])).toEqual([
      "bareboat",
      "skipper",
      "full-crew",
    ]);
  });

  it("does not call a hostess without a skipper a full crew", () => {
    expect(crewOptionsFor("bareboat", ["hostess", "cook"])).toEqual(["bareboat"]);
  });

  it("treats an operator that never said as bareboat", () => {
    expect(crewOptionsFor(null, ["skipper"])).toEqual(["bareboat", "skipper"]);
  });

  /*
   * Tiramisu Excess 14 (Booking Manager, 39115656) is filed bareboat and carries an obligatory
   * skipper at 1,505 EUR. The sidebar offered Bareboat and then billed the skipper anyway.
   */
  it("stops offering bareboat when the skipper is billed either way", () => {
    expect(crewOptionsFor("bareboat", ["skipper"], ["skipper"])).toEqual(["skipper"]);
    expect(crewOptionsFor(null, ["skipper"], ["skipper"])).toEqual(["skipper"]);
    expect(crewOptionsFor("bareboat", ["skipper", "cook"], ["skipper"])).toEqual([
      "skipper",
      "full-crew",
    ]);
  });

  it("leaves an optional skipper as a choice", () => {
    expect(crewOptionsFor("bareboat", ["skipper"], [])).toEqual(["bareboat", "skipper"]);
    /* An obligatory cook says nothing about whether the hull needs a skipper. */
    expect(crewOptionsFor("bareboat", ["skipper"], ["cook"])).toEqual(["bareboat", "skipper"]);
  });
});
