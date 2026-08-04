import { db } from "./index";
import {
  amenity,
  amenityCategory,
  availabilitySlot,
  base,
  builder,
  country,
  listing,
  listingAmenity,
  listingCheckinRule,
  listingMedia,
  listingSource,
  listingSpecification,
  location,
  operator,
  provider,
  providerRecord,
  providerRawPayload,
  region,
  review,
  syncRun,
  yachtCategory,
  yachtModel,
} from "./schema";

async function main() {
  await db
    .insert(provider)
    .values({
      id: "prv_mock",
      code: "mock",
      name: "Mock Inventory Provider",
      enabled: true,
      defaultCurrency: "EUR",
    })
    .onConflictDoNothing();

  await db
    .insert(syncRun)
    .values({
      id: "sync_mock_catalogue",
      providerId: "prv_mock",
      kind: "catalogue",
      status: "success",
      createdCount: 2,
      startedAt: new Date(),
      finishedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(country)
    .values([
      { id: "cty_hr", code: "HR", name: "Croatia" },
      { id: "cty_gr", code: "GR", name: "Greece" },
    ])
    .onConflictDoNothing();

  await db
    .insert(region)
    .values([
      { id: "rgn_dalmatia", countryId: "cty_hr", name: "Dalmatia" },
      { id: "rgn_attica", countryId: "cty_gr", name: "Attica" },
    ])
    .onConflictDoNothing();

  await db
    .insert(location)
    .values([
      { id: "loc_split", regionId: "rgn_dalmatia", name: "Split" },
      { id: "loc_athens", regionId: "rgn_attica", name: "Athens" },
    ])
    .onConflictDoNothing();

  await db
    .insert(base)
    .values([
      {
        id: "base_split",
        locationId: "loc_split",
        name: "ACI Marina Split",
        lat: 43.503,
        lng: 16.43,
        checkInTime: "17:00",
        checkOutTime: "09:00",
      },
      {
        id: "base_athens",
        locationId: "loc_athens",
        name: "Alimos Marina",
        lat: 37.914,
        lng: 23.704,
        checkInTime: "17:00",
        checkOutTime: "09:00",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(operator)
    .values({
      id: "op_adriatic",
      name: "Adriatic Charter Co.",
      slug: "adriatic-charter-co",
      country: "Croatia",
      city: "Split",
      email: "ops@adriatic.example",
      phone: "+385 21 000 111",
    })
    .onConflictDoNothing();

  await db
    .insert(builder)
    .values([
      { id: "bld_lagoon", name: "Lagoon", slug: "lagoon" },
      { id: "bld_bavaria", name: "Bavaria", slug: "bavaria" },
    ])
    .onConflictDoNothing();

  await db
    .insert(yachtModel)
    .values([
      { id: "mdl_lagoon_42", builderId: "bld_lagoon", name: "Lagoon 42" },
      { id: "mdl_bavaria_c45", builderId: "bld_bavaria", name: "C45" },
    ])
    .onConflictDoNothing();

  await db
    .insert(yachtCategory)
    .values([
      { id: "cat_catamaran", code: "catamaran", name: "Catamaran" },
      { id: "cat_sailing", code: "sailing-yacht", name: "Sailing yacht" },
    ])
    .onConflictDoNothing();

  await db
    .insert(amenityCategory)
    .values([
      { id: "amc_comfort", name: "Comfort" },
      { id: "amc_equipment", name: "Equipment" },
    ])
    .onConflictDoNothing();

  await db
    .insert(amenity)
    .values([
      {
        id: "amn_ac",
        amenityCategoryId: "amc_comfort",
        code: "air-conditioning",
        name: "Air conditioning",
      },
      {
        id: "amn_dinghy",
        amenityCategoryId: "amc_equipment",
        code: "dinghy",
        name: "Dinghy",
      },
      {
        id: "amn_wifi",
        amenityCategoryId: "amc_comfort",
        code: "wifi",
        name: "Wi-Fi",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(providerRawPayload)
    .values([
      {
        id: "praw_lagoon_42_aurora",
        providerId: "prv_mock",
        payload: { id: "yacht-lagoon-42-aurora", name: "Aurora" },
      },
      {
        id: "praw_bavaria_c45_luna",
        providerId: "prv_mock",
        payload: { id: "yacht-bavaria-c45-luna", name: "Luna" },
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(providerRecord)
    .values([
      {
        id: "prec_lagoon_42_aurora",
        providerId: "prv_mock",
        resourceType: "yacht",
        externalId: "yacht-lagoon-42-aurora",
        rawPayloadId: "praw_lagoon_42_aurora",
        sourceHash: "mock-lagoon-42-aurora",
      },
      {
        id: "prec_bavaria_c45_luna",
        providerId: "prv_mock",
        resourceType: "yacht",
        externalId: "yacht-bavaria-c45-luna",
        rawPayloadId: "praw_bavaria_c45_luna",
        sourceHash: "mock-bavaria-c45-luna",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listing)
    .values([
      {
        id: "ylst_yacht-lagoon-42-aurora",
        slug: "aurora-lagoon-42-split",
        title: "Aurora Lagoon 42",
        operatorId: "op_adriatic",
        homeBaseId: "base_split",
        builderId: "bld_lagoon",
        modelId: "mdl_lagoon_42",
        categoryId: "cat_catamaran",
        defaultCurrency: "EUR",
        status: "published",
        primarySourceId: "lsrc_lagoon_42_aurora",
        freshnessAt: new Date(),
      },
      {
        id: "ylst_yacht-bavaria-c45-luna",
        slug: "luna-c45-athens",
        title: "Luna C45",
        operatorId: "op_adriatic",
        homeBaseId: "base_athens",
        builderId: "bld_bavaria",
        modelId: "mdl_bavaria_c45",
        categoryId: "cat_sailing",
        defaultCurrency: "EUR",
        status: "published",
        primarySourceId: "lsrc_bavaria_c45_luna",
        freshnessAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listingSource)
    .values([
      {
        id: "lsrc_lagoon_42_aurora",
        listingId: "ylst_yacht-lagoon-42-aurora",
        providerRecordId: "prec_lagoon_42_aurora",
        externalYachtId: "yacht-lagoon-42-aurora",
        externalCompanyId: "cmp-adriatic",
        externalBaseId: "base-split",
        matchStatus: "confirmed",
        matchConfidence: "1.0000",
      },
      {
        id: "lsrc_bavaria_c45_luna",
        listingId: "ylst_yacht-bavaria-c45-luna",
        providerRecordId: "prec_bavaria_c45_luna",
        externalYachtId: "yacht-bavaria-c45-luna",
        externalCompanyId: "cmp-adriatic",
        externalBaseId: "base-athens",
        matchStatus: "confirmed",
        matchConfidence: "1.0000",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listingSpecification)
    .values([
      {
        id: "lspec_lagoon_42_aurora",
        listingId: "ylst_yacht-lagoon-42-aurora",
        lengthM: "12.80",
        yearBuilt: 2022,
        cabins: 4,
        berths: 10,
        heads: 4,
      },
      {
        id: "lspec_bavaria_c45_luna",
        listingId: "ylst_yacht-bavaria-c45-luna",
        lengthM: "13.98",
        yearBuilt: 2021,
        cabins: 4,
        berths: 8,
        heads: 3,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listingMedia)
    .values([
      {
        id: "lmed_lagoon_42_aurora_main",
        listingId: "ylst_yacht-lagoon-42-aurora",
        externalUrl: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a",
        role: "main",
      },
      {
        id: "lmed_bavaria_c45_luna_main",
        listingId: "ylst_yacht-bavaria-c45-luna",
        externalUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
        role: "main",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listingAmenity)
    .values([
      {
        id: "lamn_lagoon_42_ac",
        listingId: "ylst_yacht-lagoon-42-aurora",
        amenityId: "amn_ac",
      },
      {
        id: "lamn_lagoon_42_dinghy",
        listingId: "ylst_yacht-lagoon-42-aurora",
        amenityId: "amn_dinghy",
      },
      {
        id: "lamn_lagoon_42_wifi",
        listingId: "ylst_yacht-lagoon-42-aurora",
        amenityId: "amn_wifi",
      },
      {
        id: "lamn_bavaria_c45_dinghy",
        listingId: "ylst_yacht-bavaria-c45-luna",
        amenityId: "amn_dinghy",
      },
      {
        id: "lamn_bavaria_c45_wifi",
        listingId: "ylst_yacht-bavaria-c45-luna",
        amenityId: "amn_wifi",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(listingCheckinRule)
    .values([
      {
        id: "lcir_lagoon_42_sat",
        listingId: "ylst_yacht-lagoon-42-aurora",
        checkinWeekday: 6,
        checkoutWeekday: 6,
        minNights: 7,
      },
      {
        id: "lcir_bavaria_c45_sat",
        listingId: "ylst_yacht-bavaria-c45-luna",
        checkinWeekday: 6,
        checkoutWeekday: 6,
        minNights: 7,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(availabilitySlot)
    .values([
      {
        id: "avsl_lagoon_42_2026_08_08",
        listingId: "ylst_yacht-lagoon-42-aurora",
        listingSourceId: "lsrc_lagoon_42_aurora",
        startDate: "2026-08-08",
        endDate: "2026-08-15",
        status: "available",
        priceMinor: 540000,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
        sourceHash: "mock-lagoon-42-2026-08-08",
      },
      {
        id: "avsl_bavaria_c45_2026_08_08",
        listingId: "ylst_yacht-bavaria-c45-luna",
        listingSourceId: "lsrc_bavaria_c45_luna",
        startDate: "2026-08-08",
        endDate: "2026-08-15",
        status: "available",
        priceMinor: 390000,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
        sourceHash: "mock-bavaria-c45-2026-08-08",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(review)
    .values([
      {
        id: "rev_lagoon_42_aurora",
        listingId: "ylst_yacht-lagoon-42-aurora",
        rating: 5,
        author: "Marta K.",
        body: "Clean handover, accurate photos, and a smooth week aboard.",
      },
      {
        id: "rev_bavaria_c45_luna",
        listingId: "ylst_yacht-bavaria-c45-luna",
        rating: 5,
        author: "Ivan P.",
        body: "A practical yacht for a family route through the Saronic islands.",
      },
    ])
    .onConflictDoNothing();

  console.log("Seeded mock yacht-charter catalogue.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
