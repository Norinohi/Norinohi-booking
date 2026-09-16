import { describe, expect, it } from "vitest";

import { dateStringSchema } from "./primitives";

describe("dateStringSchema", () => {
  it.each(["2026-07-04", "2028-02-29", "2026-12-31"])("accepts %s", (day) => {
    expect(dateStringSchema.safeParse(day).success).toBe(true);
  });

  it.each(["2026-02-31", "2027-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "4.7.2026"])(
    "rejects %s",
    (day) => {
      expect(dateStringSchema.safeParse(day).success).toBe(false);
    },
  );
});
