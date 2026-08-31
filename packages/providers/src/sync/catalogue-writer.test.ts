import { describe, expect, it } from "vitest";

import { decideListingMatch, facetLabels } from "./catalogue-writer";

describe("decideListingMatch", () => {
  it("gives a record we have not seen before its own listing", () => {
    // No fuzzy same-provider matching: the vendor's id space is the identity, and guessing
    // past it by name and model is what fused 486 Booking Manager records onto 172 listings.
    expect(decideListingMatch({ providerKey: "booking_manager", existing: null })).toEqual({
      listingId: null,
      matchStatus: "unmatched",
      matchConfidence: null,
      matchedBy: null,
    });
  });

  it("re-uses the listing an external yacht id is already linked to", () => {
    expect(
      decideListingMatch({
        providerKey: "nausys",
        existing: {
          listingSourceId: "lsrc_1",
          listingId: "ylst_known",
          matchStatus: "unmatched",
        },
      }).listingId,
    ).toBe("ylst_known");
  });

  it("reaches no verdict on a link it is only seeing again", () => {
    for (const matchStatus of ["unmatched", "auto", "confirmed", "rejected"] as const) {
      expect(
        decideListingMatch({
          providerKey: "nausys",
          existing: { listingSourceId: "lsrc_1", listingId: "ylst_known", matchStatus },
        }),
      ).toEqual({
        listingId: "ylst_known",
        matchStatus,
        matchConfidence: null,
        matchedBy: null,
      });
    }
  });

  it("gives a source that is attached to nothing its own listing", () => {
    expect(
      decideListingMatch({
        providerKey: "nausys",
        existing: { listingSourceId: "lsrc_1", listingId: null, matchStatus: "unmatched" },
      }).listingId,
    ).toBeNull();
  });
});

describe("facetLabels", () => {
  const empty = {
    countries: [],
    regions: [],
    locations: [],
    bases: [],
    operators: [],
    builders: [],
    models: [],
    categories: [],
    amenityCategories: [],
    amenities: [],
    listings: [],
  };

  const amenity = (name: string, translations?: Record<string, string>) => ({
    externalId: name,
    externalAmenityCategoryId: "1",
    name,
    translations,
  });

  it("keeps only the locales the site serves", () => {
    const [label] = facetLabels({
      ...empty,
      amenities: [
        amenity("Autopilot", { de: "Autopilot", es: "Piloto", it: "Pilota", ru: "Автопилот" }),
      ],
    });

    expect(label?.translations).toEqual({ de: "Autopilot", es: "Piloto" });
  });

  it("skips a facet the provider named in one language", () => {
    expect(facetLabels({ ...empty, amenities: [amenity("Autopilot")] })).toEqual([]);
    expect(facetLabels({ ...empty, amenities: [amenity("Autopilot", { it: "Pilota" })] })).toEqual(
      [],
    );
  });

  it("folds spellings the read join cannot tell apart into one facet", () => {
    const labels = facetLabels({
      ...empty,
      amenities: [
        amenity("Bow thruster", { de: "Bugstrahlruder" }),
        amenity("bow-thruster", { de: "Bugstrahlruder (Zweit)" }),
      ],
    });

    expect(labels).toHaveLength(1);
    expect(labels[0]?.value).toBe("Bow thruster");
  });

  it("names each list with the facet kind the search cards read", () => {
    const labels = facetLabels({
      ...empty,
      countries: [
        { externalId: "1", code: "HR", name: "Croatia", translations: { de: "Kroatien" } },
      ],
      amenities: [amenity("Autopilot", { de: "Autopilot" })],
    });

    expect(labels.map((label) => label.kind).sort()).toEqual(["country", "equipment"]);
  });
});
