import { describe, expect, it } from "vitest";

import { type CatalogPage, catalogPageRegions, catalogPageSiblings } from "./catalog-page";

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
    page("type-geo", ["catamaran", "croatia", "kastela"], 40),
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

describe("catalogPageRegions", () => {
  const croatia = page("country", ["croatia"], 5000);
  const region = (segments: string[], count: number): CatalogPage => ({
    ...page("geo", segments, count),
    filters: { country: "Croatia", region: segments.at(-1) },
  });
  const pages = [
    croatia,
    region(["croatia", "istria"], 100),
    region(["croatia", "dalmatia"], 900),
    page("geo", ["croatia", "kastela"], 241),
    region(["greece", "ionian"], 500),
  ];

  it("links a country's region pages, busiest first, leaving cities out", () => {
    expect(paths(catalogPageRegions(pages, croatia))).toEqual([
      "croatia/dalmatia",
      "croatia/istria",
    ]);
  });

  it("gives no region links below the country level", () => {
    expect(catalogPageRegions(pages, page("geo", ["croatia", "kastela"], 241))).toEqual([]);
  });
});
