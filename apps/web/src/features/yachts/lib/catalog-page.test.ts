import { describe, expect, it } from "vitest";

import { type CatalogPage, catalogPageSiblings } from "./catalog-page";

const page = (kind: CatalogPage["kind"], segments: string[], count: number): CatalogPage => ({
  root: "yacht-charter",
  kind,
  segments,
  filters: {},
  labels: segments,
  count,
});

const paths = (pages: CatalogPage[]) => pages.map((item) => item.segments.join("/"));

describe("catalogPageSiblings", () => {
  const kastela = page("marina", ["croatia", "kastela", "marina-kastela"], 241);
  const pages = [
    page("country", ["croatia"], 5000),
    page("geo", ["croatia", "kastela"], 241),
    kastela,
    page("marina", ["croatia", "trogir", "aci-marina-trogir"], 133),
    page("marina", ["croatia", "zadar", "marina-zadar"], 92),
    page("marina", ["greece", "lavrio", "lavrion"], 300),
    page("type-marina", ["catamaran", "croatia", "kastela", "marina-kastela"], 40),
  ];

  it("links the other marinas in the country when the town has no second one", () => {
    expect(paths(catalogPageSiblings(pages, kastela))).toEqual([
      "croatia/trogir/aci-marina-trogir",
      "croatia/zadar/marina-zadar",
    ]);
  });

  it("puts a marina in the same town ahead of a busier one elsewhere in the country", () => {
    const lav = page("marina", ["croatia", "kastela", "marina-lav"], 10);

    expect(paths(catalogPageSiblings([...pages, lav], kastela))).toEqual([
      "croatia/kastela/marina-lav",
      "croatia/trogir/aci-marina-trogir",
      "croatia/zadar/marina-zadar",
    ]);
  });

  it("keeps every other level to the pages under the same parent", () => {
    const region = page("geo", ["croatia", "split-region"], 900);

    expect(paths(catalogPageSiblings([...pages, region], region))).toEqual(["croatia/kastela"]);
  });
});
