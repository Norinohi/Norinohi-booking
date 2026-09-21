import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import type * as schema from "../schema";
import { localizeQuoteLines } from "./localize-quote";

/**
 * Answers the two lookups in the order the function makes them: translations by extra code,
 * then by name. Only `execute` exists, so any other query is a TypeError, not a quiet pass.
 */
function fakeDb(byCode: { code: string; label: string }[]) {
  const answers = [byCode, []];
  // SAFETY: a stub with only `execute` behind it; see the docstring.
  const db = Object.assign({} as NodePgDatabase<typeof schema>, {
    execute: () => Promise.resolve({ rows: answers.shift() ?? [] }),
  });
  return { db };
}

describe("localizeQuoteLines", () => {
  it("names a NauSYS discount in the reader's language, and keeps the stored one otherwise", async () => {
    // SAFETY: a stub with only `execute`; a discount-only quote makes just the one lookup.
    const db = Object.assign({} as NodePgDatabase<typeof schema>, {
      execute: () => Promise.resolve({ rows: [{ id: "6001", name: "Frühbucherrabatt" }] }),
    });

    const lines = await localizeQuoteLines(
      db,
      "ylst_1",
      [
        { code: "nausys-discount-6001", label: "Early booking", kind: "discount" },
        { code: "nausys-discount-6002", label: "Block Time Discount", kind: "discount" },
      ],
      "de",
    );

    expect(lines.map((line) => line.label)).toEqual(["Frühbucherrabatt", "Block Time Discount"]);
  });

  it("translates a variant line by its extra and gives it its variant back", async () => {
    const { db } = fakeDb([{ code: "service:100511", label: "Трансфер" }]);

    const [line] = await localizeQuoteLines(
      db,
      "ylst_1",
      [
        {
          code: "service:100511@66279573",
          label: "Transfer (Athens Airport - Lavrion base; minivan up to 8 pax)",
          detail: "Athens Airport - Lavrion base; minivan up to 8 pax",
          kind: "extra",
        },
      ],
      "uk",
    );

    expect(line?.label).toBe("Трансфер (Athens Airport - Lavrion base; minivan up to 8 pax)");
  });

  it("leaves a variant line as the vendor named it when nothing translates", async () => {
    const { db } = fakeDb([]);
    const original = {
      code: "service:100511@66279573",
      label: "Transfer (taxi 1 - 3 pax)",
      detail: "taxi 1 - 3 pax",
      kind: "extra",
    };

    expect(await localizeQuoteLines(db, "ylst_1", [original], "uk")).toEqual([original]);
  });
});
