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

  it("escapes a comma, which would otherwise end the candidate", () => {
    expect(srcsetSafeUrl("https://example.com/boat,1.jpg")).toBe(
      "https://example.com/boat%2C1.jpg",
    );
  });

  it("keeps the query a CDN reads", () => {
    const url = "https://cdn.example.com/boat.jpg?width=640&format=webp";
    expect(srcsetSafeUrl(url)).toBe(url);
  });

  it("returns a relative path untouched", () => {
    expect(srcsetSafeUrl("/images/hero.jpg")).toBe("/images/hero.jpg");
  });
});
