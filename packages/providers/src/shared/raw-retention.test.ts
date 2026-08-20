import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  type RawPayloadWriter,
  retainRawPayloads,
  stableSourceHash,
} from "./raw-retention";

/** The fake resolves the insert to nothing; the real driver resolves it to its own result. */
type FakeWriter = RawPayloadWriter<void>;
type RawPayloadRows = Parameters<ReturnType<FakeWriter["insert"]>["values"]>[0];

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

describe("retainRawPayloads", () => {
  function fakeWriter() {
    const statements: RawPayloadRows[] = [];
    const db: FakeWriter = {
      insert: () => ({
        values: (rows) => {
          statements.push(rows);
          return Promise.resolve(undefined);
        },
      }),
    };
    return { db, statements };
  }

  it("returns an id per payload, in the order they were given", async () => {
    const { db, statements } = fakeWriter();
    const ids = await retainRawPayloads(db, "prv_nausys", [{ n: 1 }, { n: 2 }, { n: 3 }]);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    // The ids are the ones written, not ones read back out of RETURNING — that is
    // what lets the caller reference them from the same batch.
    expect(statements[0]?.map((row) => row.id)).toEqual(ids);
    expect(statements[0]?.map((row) => row.payload)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("mints ids the id() column helper would have accepted", async () => {
    const { db } = fakeWriter();
    const [first] = await retainRawPayloads(db, "prv_nausys", [{ status: "OK" }]);
    expect(first).toMatch(/^praw_/);
  });

  it("writes one statement for the whole batch", async () => {
    const { db, statements } = fakeWriter();
    await retainRawPayloads(db, "prv_nausys", [{ n: 1 }, { n: 2 }]);
    expect(statements).toHaveLength(1);
  });

  it("touches the database for nothing when there is nothing to retain", async () => {
    const { db, statements } = fakeWriter();
    await expect(retainRawPayloads(db, "prv_nausys", [])).resolves.toEqual([]);
    expect(statements).toHaveLength(0);
  });

  it("redacts credentials before the payload is stored", async () => {
    const { db, statements } = fakeWriter();
    await retainRawPayloads(db, "prv_nausys", [
      {
        credentials: { username: "agency-user", password: "hunter2" },
        periodFrom: "04.07.2026",
      },
    ]);

    expect(JSON.stringify(statements)).not.toContain("hunter2");
    expect(JSON.stringify(statements)).toContain("04.07.2026");
  });
});
