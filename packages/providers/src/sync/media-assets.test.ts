import { describe, expect, it } from "vitest";

import { providerMediaStoragePath, providerMediaUrlHash } from "./media-assets";

describe("provider media asset identity", () => {
  it("uses a stable hash for the same provider URL", () => {
    const url = "https://img.example.test/yachts/photo.jpg?width=3000";

    expect(providerMediaUrlHash(url)).toBe(providerMediaUrlHash(url));
  });

  it("scopes storage paths by provider", () => {
    const url = "https://img.example.test/yachts/photo.jpg";

    expect(providerMediaStoragePath("booking_manager", url)).toMatch(/^booking_manager\/.+\.jpg$/);
    expect(providerMediaStoragePath("nausys", url)).toMatch(/^nausys\/.+\.jpg$/);
  });

  it("normalizes jpeg extensions and falls back to jpg when a URL has none", () => {
    expect(
      providerMediaStoragePath("booking_manager", "https://img.example.test/photo.jpeg"),
    ).toMatch(/\.jpg$/);
    expect(providerMediaStoragePath("booking_manager", "https://img.example.test/photo")).toMatch(
      /\.jpg$/,
    );
  });
});
