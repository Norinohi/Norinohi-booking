import { describe, expect, it } from "vitest";

import { catalogue } from "../mock/data";
import { ContractError, NotFoundError } from "../shared/errors";
import type { ProviderRecordSet } from "../types";
import {
  mapSlotToOffer,
  mapYachtToListing,
  projectMockCatalogue,
  rawEntities,
  resolveFixtureReference,
} from "./mock";

function ingestedRecords(): ProviderRecordSet {
  const records: ProviderRecordSet = new Map();

  for (const entity of rawEntities()) {
    const bucket = records.get(entity.resourceType) ?? [];
    bucket.push({
      externalId: entity.externalId,
      scopeKey: entity.scopeKey,
      payload: entity.payload,
    });
    records.set(entity.resourceType, bucket);
  }

  return records;
}

describe("mock mapping", () => {
  it("maps a provider yacht into a canonical listing", () => {
    const yacht = catalogue.yachts[0];
    if (!yacht) {
      throw new Error("Expected first yacht fixture");
    }

    const listing = mapYachtToListing(yacht);

    expect(listing.id).toBe("ylst_yacht-lagoon-42-aurora");
    expect(listing.category).toBe("Catamaran");
    expect(listing.base.country).toBe("Croatia");
    expect(listing.providerSourceId).toBe("mock:yacht-lagoon-42-aurora");
  });

  it("maps availability slots into deterministic offers", () => {
    const offer = mapSlotToOffer(
      {
        yachtId: "yacht-lagoon-42-aurora",
        startDate: "2026-08-08",
        endDate: "2026-08-15",
        status: "available",
        priceMinor: 540000,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
      },
      6,
    );

    expect(offer.nights).toBe(7);
    expect(offer.clientPrice.amountMinor).toBe(540000);
    expect(offer.obligatoryExtras).toHaveLength(1);
  });

  it("scopes yacht and base records to the owning company", () => {
    const entities = rawEntities();
    const yacht = entities.find((entity) => entity.externalId === "yacht-lagoon-42-aurora");
    const base = entities.find((entity) => entity.externalId === "base-split");

    expect(yacht?.scopeKey).toBe("cmp-adriatic");
    expect(base?.scopeKey).toBe("cmp-adriatic");
  });
});

describe("catalogue projection", () => {
  it("projects every reference entity the writer has to upsert first", () => {
    const projected = projectMockCatalogue(ingestedRecords());

    expect(projected.operators).toHaveLength(catalogue.companies.length);
    expect(projected.bases).toHaveLength(catalogue.bases.length);
    expect(projected.builders).toHaveLength(catalogue.builders.length);
    expect(projected.models).toHaveLength(catalogue.models.length);
    expect(projected.categories).toHaveLength(catalogue.categories.length);
    expect(projected.amenities).toHaveLength(catalogue.amenities.length);
    expect(projected.listings).toHaveLength(catalogue.yachts.length);
  });

  it("derives the geography tree the bases only carry as names", () => {
    const projected = projectMockCatalogue(ingestedRecords());

    expect(projected.countries.map((item) => item.code).sort()).toEqual([
      "ES",
      "GR",
      "HR",
      "IT",
      "TH",
    ]);
    expect(projected.regions).toHaveLength(6);
    expect(projected.locations).toHaveLength(7);

    const split = projected.bases.find((item) => item.externalId === "base-split");
    const location = projected.locations.find(
      (item) => item.externalId === split?.externalLocationId,
    );
    const region = projected.regions.find((item) => item.externalId === location?.externalRegionId);

    expect(location?.name).toBe("Split");
    expect(region?.name).toBe("Dalmatia");
    expect(region?.externalCountryId).toBe("country-hr");
  });

  it("keeps every id in the projection a provider id", () => {
    const projected = projectMockCatalogue(ingestedRecords());
    const listing = projected.listings.find((item) => item.externalId === "yacht-lagoon-42-aurora");

    expect(listing?.externalCompanyId).toBe("cmp-adriatic");
    expect(listing?.externalBaseId).toBe("base-split");
    expect(listing?.amenities).toContain("amn-ac");
    expect(listing?.media[0]).toEqual({
      externalUrl: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a",
      role: "main",
      sortOrder: 0,
    });
    expect(listing?.texts).toEqual([
      {
        kind: "description",
        locale: "en",
        value: "Aurora is a 2022 Lagoon 42 sleeping 10 in 4 cabins.",
      },
    ]);
    expect(listing?.checkinRules).toEqual([
      { checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 },
    ]);
    expect(listing?.oneWayRules).toEqual([
      { startDate: "2026-06-01", endDate: "2026-09-30", isOneWay: true },
    ]);
    expect(listing?.securityDepositMinor).toBe(200000);
  });

  it("is a function of the records it is given, not of the fixtures", () => {
    const projected = projectMockCatalogue(new Map());

    expect(projected.listings).toEqual([]);
    expect(projected.countries).toEqual([]);
  });

  it("rejects a payload that has drifted from the expected shape", () => {
    const records: ProviderRecordSet = new Map([
      ["yacht", [{ externalId: "yacht-broken", payload: { id: "yacht-broken" } }]],
    ]);

    expect(() => projectMockCatalogue(records)).toThrow(ContractError);
  });

  it("refuses a yacht whose cross-references did not arrive", () => {
    const yacht = catalogue.yachts[0];
    const records: ProviderRecordSet = new Map([
      ["yacht", [{ externalId: "yacht-lagoon-42-aurora", payload: yacht }]],
    ]);

    expect(() => projectMockCatalogue(records)).toThrow(ContractError);
  });
});

describe("fixture reference resolution", () => {
  it("recovers the listing and the period from a reservation handle", () => {
    expect(resolveFixtureReference("res_qte_mock_yacht_lagoon_42_aurora_2026_08_08")).toEqual({
      yachtId: "yacht-lagoon-42-aurora",
      listingId: "ylst_yacht-lagoon-42-aurora",
      quoteId: "qte_mock_yacht_lagoon_42_aurora_2026_08_08",
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
    });
  });

  it("rejects a handle no fixture stands behind", () => {
    expect(() => resolveFixtureReference("res_unknown")).toThrow(NotFoundError);
  });
});
