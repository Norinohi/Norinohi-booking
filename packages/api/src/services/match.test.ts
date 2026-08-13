import { describe, expect, it } from "vitest";

import { type MediaRow, pickPrimaryImage } from "./match";

const media = (overrides: Partial<MediaRow>): MediaRow => ({
  source: "nausys",
  role: "gallery",
  sortOrder: 0,
  externalUrl: "https://example.test/image.jpg",
  ...overrides,
});

describe("pickPrimaryImage", () => {
  it("returns null when the listing has no media", () => {
    expect(pickPrimaryImage([])).toBeNull();
  });

  it("prefers Booking Manager over NauSYS on a merged listing", () => {
    const picked = pickPrimaryImage([
      media({ source: "nausys", role: "main", externalUrl: "https://ns.test/main.jpg" }),
      media({ source: "booking_manager", role: "gallery", externalUrl: "https://bm.test/1.jpg" }),
    ]);

    expect(picked).toBe("https://bm.test/1.jpg");
  });

  it("prefers the main image within one source", () => {
    const picked = pickPrimaryImage([
      media({ source: "booking_manager", role: "gallery", externalUrl: "https://bm.test/1.jpg" }),
      media({ source: "booking_manager", role: "main", externalUrl: "https://bm.test/main.jpg" }),
    ]);

    expect(picked).toBe("https://bm.test/main.jpg");
  });

  it("falls back to sort order for equally ranked media", () => {
    const picked = pickPrimaryImage([
      media({ role: "gallery", sortOrder: 3, externalUrl: "https://ns.test/3.jpg" }),
      media({ role: "gallery", sortOrder: 1, externalUrl: "https://ns.test/1.jpg" }),
    ]);

    expect(picked).toBe("https://ns.test/1.jpg");
  });

  it("uses an unknown or missing source only as a last resort", () => {
    const picked = pickPrimaryImage([
      media({ source: null, role: "main", externalUrl: "https://unknown.test/main.jpg" }),
      media({ source: "nausys", role: "gallery", externalUrl: "https://ns.test/1.jpg" }),
    ]);

    expect(picked).toBe("https://ns.test/1.jpg");
  });
});
