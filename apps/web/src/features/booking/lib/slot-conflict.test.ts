import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { isSlotConflict } from "./slot-conflict";

describe("isSlotConflict", () => {
  it("recognises a CONFLICT refusal", () => {
    expect(isSlotConflict(new ORPCError("CONFLICT", { message: "Period taken" }))).toBe(true);
  });

  it.each(["NOT_FOUND", "BAD_REQUEST", "INTERNAL_SERVER_ERROR"])("ignores %s", (code) => {
    expect(isSlotConflict(new ORPCError(code))).toBe(false);
  });

  it("ignores a plain error that merely says conflict", () => {
    expect(isSlotConflict(new Error("CONFLICT"))).toBe(false);
  });
});
