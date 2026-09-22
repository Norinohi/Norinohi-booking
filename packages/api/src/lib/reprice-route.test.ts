import { describe, expect, it } from "vitest";

import { repriceRoute } from "./reprice-route";

/*
 * Carrick (100) and Portumna (200) both sell the Shannon week of 26 September 2026. The quote
 * started at Carrick; asking for Portumna as the drop-off must price Carrick to Portumna, not the
 * round trip from Portumna the provider ranks first.
 */
const roundTrip = { route: { startBaseId: "100", endBaseId: "100" } };
const oneWay = { route: { startBaseId: "100", endBaseId: "200" } };

describe("repriceRoute", () => {
  it("keeps the quoted start beside a chosen drop-off", () => {
    expect(repriceRoute(roundTrip, { endBaseId: "200" })).toEqual({
      startBaseId: "100",
      endBaseId: "200",
    });
  });

  it("takes the start the sidebar sent", () => {
    expect(repriceRoute(roundTrip, { startBaseId: "100", endBaseId: "200" })).toEqual({
      startBaseId: "100",
      endBaseId: "200",
    });
  });

  it("returns to the quoted start when the drop-off is cleared", () => {
    expect(repriceRoute(oneWay, { endBaseId: null })).toEqual({ startBaseId: "100" });
  });

  it("keeps the whole pair across a change that names neither end", () => {
    expect(repriceRoute(oneWay, {})).toEqual({ startBaseId: "100", endBaseId: "200" });
  });

  it("frees the start when asked to", () => {
    expect(repriceRoute(roundTrip, { startBaseId: null })).toEqual({ endBaseId: "100" });
  });

  it("pins nothing where the quote named no bases", () => {
    expect(repriceRoute({ route: null }, {})).toEqual({});
  });
});
