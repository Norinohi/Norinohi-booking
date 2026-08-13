import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  type RawPayloadWriter,
  retainRawPayload,
  stableSourceHash,
} from "./raw-retention";

type RawPayloadRow = Parameters<ReturnType<RawPayloadWriter["insert"]>["values"]>[0];

/** A payload that points at itself, which is what the cycle guard exists for. */
interface CyclicRecord {
  id: number;
  self?: CyclicRecord;
}

describe("stableSourceHash", () => {
  it("ignores key order at every depth", () => {
    const a = {
      id: 4711001,
      name: "Marlin",
      base: { id: 900101, checkInTime: "17:00" },
      equipment: [{ equipmentId: 51001, quantity: 1 }],
    };
    const b = {
      equipment: [{ quantity: 1, equipmentId: 51001 }],
      base: { checkInTime: "17:00", id: 900101 },
      name: "Marlin",
      id: 4711001,
    };

    expect(stableSourceHash(a)).toBe(stableSourceHash(b));
    // The naive implementation this replaces would disagree.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("changes when any value changes", () => {
    const base = { price: { clientPrice: "3340.00", currency: "EUR" } };
    expect(stableSourceHash(base)).not.toBe(
      stableSourceHash({ price: { clientPrice: "3340.01", currency: "EUR" } }),
    );
  });

  it("keeps array order significant", () => {
    expect(stableSourceHash([1, 2])).not.toBe(stableSourceHash([2, 1]));
  });

  it("treats an undefined property as absent and survives null and cycles", () => {
    expect(stableSourceHash({ a: 1, b: undefined })).toBe(stableSourceHash({ a: 1 }));
    expect(stableSourceHash({ a: null })).not.toBe(stableSourceHash({ a: 1 }));
    expect(stableSourceHash(undefined)).toBe(stableSourceHash(null));

    const cyclic: CyclicRecord = { id: 1 };
    cyclic.self = cyclic;
    expect(() => stableSourceHash(cyclic)).not.toThrow();
  });

  it("emits sorted canonical JSON", () => {
    expect(canonicalJson({ b: [3, { d: 1, c: 2 }], a: "x" })).toBe(
      '{"a":"x","b":[3,{"c":2,"d":1}]}',
    );
  });
});

describe("retainRawPayload", () => {
  function fakeWriter() {
    const values: RawPayloadRow[] = [];
    const db: RawPayloadWriter = {
      insert: () => ({
        values: (value) => {
          values.push(value);
          return { returning: () => Promise.resolve([{ id: "praw_1" }]) };
        },
      }),
    };
    return { db, values };
  }

  it("returns the inserted id", async () => {
    const { db } = fakeWriter();
    await expect(retainRawPayload(db, "prv_nausys", { status: "OK" })).resolves.toBe("praw_1");
  });

  it("redacts credentials before the payload is stored", async () => {
    const { db, values } = fakeWriter();
    await retainRawPayload(db, "prv_nausys", {
      credentials: { username: "agency-user", password: "hunter2" },
      periodFrom: "04.07.2026",
    });

    expect(JSON.stringify(values)).not.toContain("hunter2");
    expect(JSON.stringify(values)).toContain("04.07.2026");
  });
});
