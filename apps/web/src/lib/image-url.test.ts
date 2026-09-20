import { describe, expect, it } from "vitest";

import { srcsetSafeUrl } from "./image-url";

describe("srcsetSafeUrl", () => {
  it("escapes the spaces NauSYS leaves in photo file names", () => {
    expect(
      srcsetSafeUrl("https://ws.nausys.com/CBMS-external/rest/yacht/12930209/pictures/w (5).jpg"),
    ).toBe("https://ws.nausys.com/CBMS-external/rest/yacht/12930209/pictures/w%20(5).jpg");
    expect(srcsetSafeUrl("https://example.com/boats/Photo net.jpg")).toBe(
      "https://example.com/boats/Photo%20net.jpg",
    );
  });

  it("does not encode an already encoded URL a second time", () => {
    const encoded = "https://ws.nausys.com/pictures/w%20(5).jpg";
    expect(srcsetSafeUrl(encoded)).toBe(encoded);
    expect(srcsetSafeUrl(srcsetSafeUrl("https://example.com/a b.jpg"))).toBe(
      "https://example.com/a%20b.jpg",
    );
  });

  it("keeps the commas Mapbox reads as coordinates", () => {
    const url =
      "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/16.24825,43.51373,9/500x236@2x?access_token=pk.test";
    expect(srcsetSafeUrl(url)).toBe(url);
  });

  it("keeps the query a CDN reads", () => {
    const url = "https://cdn.example.com/boat.jpg?width=640&format=webp";
    expect(srcsetSafeUrl(url)).toBe(url);
  });

  it("returns a relative path untouched", () => {
    expect(srcsetSafeUrl("/images/hero.jpg")).toBe("/images/hero.jpg");
  });
});
