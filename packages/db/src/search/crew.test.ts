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
});
