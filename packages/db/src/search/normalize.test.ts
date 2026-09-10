import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { normalizedKey, normalizedKeySql } from "./normalize";

describe("normalizedKey", () => {
  it("folds punctuation and case the way the facet groups", () => {
    expect(normalizedKey("Wi-Fi & Internet")).toBe("wifiandinternet");
    expect(normalizedKey("  Sailing yacht ")).toBe("sailingyacht");
    expect(normalizedKey("sailing-yacht")).toBe("sailingyacht");
  });

  /*
   * The pairs that made one marina two facet options. Each is the same base under a NauSYS
   * spelling and a Booking Manager one, and before accents folded the accented half lost the
   * letter entirely -- "sukoandmarin..." against "sukosandmarin...".
   */
  it("folds a vendor's accents onto the other vendor's transliteration", () => {
    expect(normalizedKey("Sukošan / D-Marin Dalmacija Marina")).toBe(
      normalizedKey("Sukosan, D-Marin Dalmacija Marina"),
    );
    expect(normalizedKey("Marmaris / Adaköy Marina")).toBe(normalizedKey("Marmaris Adakoy Marina"));
    expect(normalizedKey("Baotić Yachting")).toBe(normalizedKey("Baotic Yachting"));
  });

  /* The three letters `unaccent` would have folded and a Unicode decomposition would not. */
  it("folds the letters that carry no combining accent", () => {
    expect(normalizedKey("Tromsø")).toBe("tromso");
    expect(normalizedKey("Kuşadası")).toBe("kusadasi");
    expect(normalizedKey("Straße")).toBe("strasse");
  });

  it("drops a letter it has no fold for rather than inventing one", () => {
    expect(normalizedKey("Μαρίνα 2")).toBe("2");
  });
});

describe("normalizedKeySql", () => {
  /*
   * The SQL half cannot be executed here, so this asserts the one property that makes the two
   * halves agree: both are generated from the same fold table. A character added to one side
   * only would fold in Postgres and vanish in JavaScript, which is a facet join that silently
   * returns nothing.
   */
  it("is built from the same fold table as normalizedKey", () => {
    const { params } = new PgDialect().sqlToQuery(normalizedKeySql(sql`doc.base_name`));
    const from = String(params.at(-2));
    const to = String(params.at(-1));

    expect([...from]).toHaveLength([...to].length);
    for (const [index, char] of [...from].entries()) {
      expect(normalizedKey(char)).toBe(to[index]);
    }
  });
});
