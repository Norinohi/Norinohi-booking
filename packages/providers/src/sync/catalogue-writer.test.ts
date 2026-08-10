import { describe, expect, it } from "vitest";

import { decideListingMatch, listingMatchKey } from "./catalogue-writer";

const incoming = {
  externalCompanyId: "102701",
  externalBaseId: "900101",
  model: "mdl_bavaria_46",
  yearBuilt: 2021,
  name: "Marlin Bavaria Cruiser 46",
};

describe("listingMatchKey", () => {
  it("is insensitive to case and surrounding space, and nothing else", () => {
    expect(listingMatchKey(incoming)).toBe(
      listingMatchKey({ ...incoming, name: "  MARLIN Bavaria Cruiser 46 " }),
    );
    expect(listingMatchKey(incoming)).not.toBe(
      listingMatchKey({ ...incoming, externalBaseId: "900102" }),
    );
    expect(listingMatchKey(incoming)).not.toBe(listingMatchKey({ ...incoming, yearBuilt: 2020 }));
    expect(listingMatchKey(incoming)).not.toBe(listingMatchKey({ ...incoming, model: null }));
  });
});

describe("decideListingMatch", () => {
  const candidates = new Map([[listingMatchKey(incoming), "ylst_existing"]]);

  it("leaves a brand new yacht unmatched, for a human to review", () => {
    expect(
      decideListingMatch({
        providerKey: "nausys",
        existing: null,
        incomingKey: listingMatchKey({ ...incoming, name: "Ariel Lagoon 42" }),
        candidates,
      }),
    ).toEqual({
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
        incomingKey: "irrelevant",
        candidates,
      }),
    ).toEqual({
      listingId: "ylst_known",
      matchStatus: "auto",
      matchConfidence: 1,
      matchedBy: "sync:nausys",
    });
  });

  it("preserves a human verdict rather than re-stamping it", () => {
    for (const matchStatus of ["confirmed", "rejected"] as const) {
      expect(
        decideListingMatch({
          providerKey: "nausys",
          existing: { listingSourceId: "lsrc_1", listingId: "ylst_known", matchStatus },
          incomingKey: "irrelevant",
          candidates,
        }),
      ).toEqual({
        listingId: "ylst_known",
        matchStatus,
        matchConfidence: null,
        matchedBy: null,
      });
    }
  });

  it("auto-matches the exact same-provider tuple", () => {
    expect(
      decideListingMatch({
        providerKey: "nausys",
        existing: null,
        incomingKey: listingMatchKey(incoming),
        candidates,
      }),
    ).toEqual({
      listingId: "ylst_existing",
      matchStatus: "auto",
      matchConfidence: 0.9,
      matchedBy: "sync:nausys",
    });
  });

  it("does not match on a near miss", () => {
    // One field of the tuple differs, so this is a candidate for review, not a match.
    expect(
      decideListingMatch({
        providerKey: "nausys",
        existing: null,
        incomingKey: listingMatchKey({ ...incoming, yearBuilt: 2022 }),
        candidates,
      }).listingId,
    ).toBeNull();
  });
});
