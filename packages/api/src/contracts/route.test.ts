import { describe, expect, it } from "vitest";

import {
  routeCreateInputSchema,
  routeStopCreateInputSchema,
  routeStopReorderInputSchema,
  routeUpdateInputSchema,
} from "./route";

const fields = { title: "Split to Vis and back", kind: "seven_days" as const, nights: 7 };

/*
 * `suggested_route_target_ck` says the same thing, but a check violation arrives from the driver
 * as an unlabelled failure with the statement in it. These cases are the reason the rule is also
 * written in Zod: the form needs the error attached to a field.
 */
describe("routeCreateInputSchema target", () => {
  it("accepts a base", () => {
    expect(routeCreateInputSchema.safeParse({ ...fields, baseId: "base_1" }).success).toBe(true);
  });

  it("accepts a region", () => {
    expect(routeCreateInputSchema.safeParse({ ...fields, regionId: "rgn_1" }).success).toBe(true);
  });

  it("rejects both, on the baseId path", () => {
    const result = routeCreateInputSchema.safeParse({
      ...fields,
      baseId: "base_1",
      regionId: "rgn_1",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["baseId"]);
  });

  it("rejects neither", () => {
    const result = routeCreateInputSchema.safeParse(fields);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["baseId"]);
  });

  it("treats an explicit null as no target", () => {
    const result = routeCreateInputSchema.safeParse({ ...fields, baseId: null, regionId: null });

    expect(result.success).toBe(false);
  });
});

describe("routeUpdateInputSchema target", () => {
  it("leaves the stored target alone when neither key is sent", () => {
    expect(routeUpdateInputSchema.safeParse({ id: "srt_1", title: "New title" }).success).toBe(
      true,
    );
  });

  it("checks the pair as soon as one side is sent", () => {
    const result = routeUpdateInputSchema.safeParse({
      id: "srt_1",
      baseId: "base_1",
      regionId: "rgn_1",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a move from a region to a base", () => {
    const result = routeUpdateInputSchema.safeParse({
      id: "srt_1",
      baseId: "base_1",
      regionId: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("routeStopCreateInputSchema coordinates", () => {
  const stop = { routeId: "srt_1", name: "Vis" };

  it("takes a position inside both ranges", () => {
    expect(
      routeStopCreateInputSchema.safeParse({ ...stop, lat: 43.0619, lng: 16.1839 }).success,
    ).toBe(true);
  });

  it("rejects a latitude past the pole", () => {
    expect(routeStopCreateInputSchema.safeParse({ ...stop, lat: 91, lng: 16 }).success).toBe(false);
  });

  it("rejects a missing position rather than defaulting one", () => {
    expect(routeStopCreateInputSchema.safeParse(stop).success).toBe(false);
  });
});

describe("routeStopReorderInputSchema", () => {
  it("requires at least one stop", () => {
    expect(routeStopReorderInputSchema.safeParse({ routeId: "srt_1", stopIds: [] }).success).toBe(
      false,
    );
  });
});
