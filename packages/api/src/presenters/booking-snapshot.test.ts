import type { CommercialSnapshot } from "@yacht-charter/db/schema/booking";
import type { FacetTranslator } from "@yacht-charter/db/search";
import { describe, expect, it } from "vitest";

import { localizeSnapshot } from "./booking-snapshot";

const snapshot: CommercialSnapshot = {
  listingTitle: "Priceless Bavaria Cruiser 40",
  baseName: "D-Marin Turgutreis",
  locationName: "Bodrum",
  countryName: "Turkey",
  mainImage: null,
  gallery: [],
  category: "Sailing yacht",
  crewType: "bareboat",
  rating: 0,
  reviewCount: 0,
  checkInTime: "17:00",
  checkOutTime: "09:00",
  specs: {
    lengthM: 12.35,
    cabins: 3,
    berths: 8,
    heads: 2,
    yearBuilt: 2020,
    sailType: "furling/roll",
  },
  amenities: ["Autopilot", "Anchor line"],
};

const uk = new Map([
  ["country:Turkey", "Туреччина"],
  ["category:Sailing yacht", "Вітрильна яхта"],
  ["sail_type:furling/roll", "Закруточний"],
  ["equipment:Autopilot", "Автопілот"],
]);
const translate: FacetTranslator = (kind, value) => uk.get(`${kind}:${value}`) ?? value;

describe("localizeSnapshot", () => {
  it("translates the facet labels a booking card and the booking page show", () => {
    const localized = localizeSnapshot(snapshot, translate);

    expect(localized.countryName).toBe("Туреччина");
    expect(localized.category).toBe("Вітрильна яхта");
    expect(localized.specs?.sailType).toBe("Закруточний");
    expect(localized.amenities).toEqual(["Автопілот", "Anchor line"]);
    expect(localized.crewType).toBe("bareboat");
    expect(localized.listingTitle).toBe(snapshot.listingTitle);
  });

  it("keeps nulls and a snapshot written before specs and amenities were captured", () => {
    const { specs: _specs, amenities: _amenities, ...old } = snapshot;
    const localized = localizeSnapshot({ ...old, category: null }, translate);

    expect(localized.category).toBeNull();
    expect(localized.specs).toBeUndefined();
    expect(localized.amenities).toBeUndefined();
  });

  it("returns the frozen snapshot untouched without a translator", () => {
    expect(localizeSnapshot(snapshot, undefined)).toBe(snapshot);
  });
});
