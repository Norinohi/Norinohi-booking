import { describe, expect, it } from "vitest";

import { pickPopular } from "./popular-yachts";

const boat = (id: string, countryKey: string, baseKey: string, categoryKey: string) => ({
  id,
  countryKey,
  baseKey,
  categoryKey,
});

const config = {
  limit: 4,
  maxPerBase: 1,
  maxPerCountry: 2,
  mix: { "motor-boat": 1, catamaran: 2 },
};

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("pickPopular", () => {
  /* The case stacked filters got wrong: a second catamaran over its type's quota still took the
     country's last place, and the motor boat behind it was dropped with its own quota open. */
  it("does not spend a country's place on a boat over its type's quota", () => {
    const rows = [
      boat("cat-1", "croatia", "split", "catamaran"),
      boat("cat-2", "croatia", "zadar", "catamaran"),
      boat("motor-1", "croatia", "dubrovnik", "motorboat"),
    ];

    expect(ids(pickPopular(rows, { ...config, mix: { catamaran: 1, "motor-boat": 1 } }))).toEqual([
      "cat-1",
      "motor-1",
    ]);
  });

  it("allows one boat per base and caps each country", () => {
    const rows = [
      boat("a", "croatia", "split", "catamaran"),
      boat("b", "croatia", "split", "catamaran"),
      boat("c", "greece", "lefkada", "catamaran"),
    ];

    expect(ids(pickPopular(rows, config))).toEqual(["a", "c"]);
  });

  it("tops up from the ranking when a type has nothing to offer", () => {
    const rows = [
      boat("sail-1", "croatia", "split", "sailingyacht"),
      boat("cat-1", "greece", "lefkada", "catamaran"),
      boat("sail-2", "spain", "ibiza", "sailingyacht"),
      boat("sail-3", "italy", "palermo", "sailingyacht"),
      boat("sail-4", "turkey", "bodrum", "sailingyacht"),
    ];

    expect(ids(pickPopular(rows, config))).toEqual(["cat-1", "sail-1", "sail-2", "sail-3"]);
  });
});
