import {
  base,
  country,
  listing,
  listingCheckinRule,
  listingFreePeriod,
  listingOffer,
  listingPricePeriod,
  listingSource,
  location,
  operator,
  provider,
  providerRecord,
  region,
} from "../schema";
import type { TestDatabase } from "./database";

const DAY = 86_400_000;

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/* A Saturday far enough ahead that no lead-time rule touches it while the suite runs. */
export function saturdayAhead(days = 60) {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));
  return date;
}

export function shiftIso(day: string, days: number) {
  return isoDay(new Date(Date.parse(day) + days * DAY));
}

/* The operator, base and provider every seeded listing hangs off. */
export async function seedSearchWorld(db: TestDatabase["db"]) {
  await db.insert(operator).values({ id: "op_test", name: "Test Charter", slug: "test-charter" });
  await db.insert(country).values({ id: "cty_test", code: "HR", name: "Croatia" });
  await db.insert(region).values({ id: "rgn_test", countryId: "cty_test", name: "Split" });
  await db.insert(location).values({ id: "loc_test", regionId: "rgn_test", name: "Kastela" });
  await db.insert(base).values({ id: "base_test", locationId: "loc_test", name: "Marina Kastela" });
  await db.insert(provider).values([
    { id: "prov_ns", code: "nausys", name: "NauSYS" },
    { id: "prov_bm", code: "booking_manager", name: "Booking Manager" },
  ]);
}

type Rule = {
  checkinWeekday?: number;
  checkoutWeekday?: number;
  minNights?: number;
  maxNights?: number;
};

/*
 * One published listing sold by one offer, NauSYS unless `providerId` says otherwise, free and
 * carrying a weekly rate across `free`. `rules` omitted means the offer publishes none.
 */
export async function seedListing(
  db: TestDatabase["db"],
  slug: string,
  options: {
    free: { from: string; to: string };
    rules?: Rule[];
    weeklyRateMinor?: number;
    providerId?: "prov_ns" | "prov_bm";
  },
) {
  const providerId = options.providerId ?? "prov_ns";
  const listingId = `lst_${slug}`;
  const offerId = `off_${slug}`;
  await db.insert(listing).values({
    id: listingId,
    slug,
    title: slug,
    operatorId: "op_test",
    homeBaseId: "base_test",
    status: "published",
  });
  await db.insert(providerRecord).values({
    id: `prec_${slug}`,
    providerId,
    resourceType: "yacht",
    externalId: slug,
  });
  await db.insert(listingSource).values({
    id: `lsrc_${slug}`,
    listingId,
    providerRecordId: `prec_${slug}`,
    externalYachtId: slug,
  });
  await db.insert(listingOffer).values({
    id: offerId,
    listingId,
    listingSourceId: `lsrc_${slug}`,
    providerId,
    operatorId: "op_test",
    homeBaseId: "base_test",
    crewType: "bareboat",
    defaultCurrency: "EUR",
  });
  if (options.rules?.length) {
    await db
      .insert(listingCheckinRule)
      .values(options.rules.map((rule) => ({ listingId, listingOfferId: offerId, ...rule })));
  }
  await db.insert(listingPricePeriod).values({
    listingId,
    listingOfferId: offerId,
    startDate: options.free.from,
    endDate: options.free.to,
    kind: "weekly",
    priceMinor: options.weeklyRateMinor ?? 400_000,
    currency: "EUR",
  });
  await db.insert(listingFreePeriod).values({
    listingId,
    listingOfferId: offerId,
    startDate: options.free.from,
    endDate: options.free.to,
  });
  return { listingId, offerId };
}
