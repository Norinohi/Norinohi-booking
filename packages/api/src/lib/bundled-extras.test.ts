import { describe, expect, it } from "vitest";

import { netOfBundles } from "./bundled-extras";

/* Company 225, West Wind: the optional Charter Pack bundles Bed linen and the obligatory Cleaning. */
const PACK = "service:4475696750000100225";
const BED_LINEN = "service:1488975580000100225";
const CLEANING = "service:26877460000100225";

const pack = { code: PACK, amountMinor: 25_000, bundles: [BED_LINEN, CLEANING] };
const offerBills = new Map([[CLEANING, 10_000]]);

describe("netOfBundles", () => {
  it("charges a pack only for what the offer does not bill already", () => {
    expect(netOfBundles([pack], offerBills).get(PACK)).toBe(15_000);
  });

  it("adds nothing for an extra a requested pack contains", () => {
    const net = netOfBundles(
      [pack, { code: BED_LINEN, amountMinor: 500, bundles: [] }],
      offerBills,
    );

    expect(net.get(BED_LINEN)).toBeNull();
    expect(net.get(PACK)).toBe(15_000);
  });

  it("keeps a pack whole when nothing it bundles is billed elsewhere", () => {
    expect(netOfBundles([pack], new Map()).get(PACK)).toBe(25_000);
  });

  /* Recorded account-wide: an optional 150 EUR "Transitlog" naming a 450 EUR obligatory pack. */
  it("keeps a pack whole when its contents are billed at or above its own price", () => {
    const transitLog = { code: "service:1", amountMinor: 15_000, bundles: ["service:2"] };

    expect(netOfBundles([transitLog], new Map([["service:2", 45_000]])).get("service:1")).toBe(
      15_000,
    );
  });

  it("drops neither of two packs that name each other", () => {
    const left = { code: "service:1", amountMinor: 1_000, bundles: ["service:2"] };
    const right = { code: "service:2", amountMinor: 2_000, bundles: ["service:1"] };
    const net = netOfBundles([left, right], new Map());

    expect([net.get("service:1"), net.get("service:2")]).toEqual([1_000, 2_000]);
  });

  it("ignores a pack that names itself", () => {
    const selfish = { code: PACK, amountMinor: 25_000, bundles: [PACK] };

    expect(netOfBundles([selfish], new Map([[PACK, 25_000]])).get(PACK)).toBe(25_000);
  });
});
