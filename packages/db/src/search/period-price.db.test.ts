import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  availabilitySlot,
  base,
  country,
  listing,
  listingCheckinRule,
  listingFreePeriod,
  listingOffer,
  listingPricePeriod,
  listingRefusedPeriod,
  listingSource,
  location,
  operator,
  provider,
  providerExtraCatalogue,
  providerRecord,
  region,
} from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { encodeSearchCursor } from "./cursor";
import { rebuildListingSearchDocs } from "./read-model";
import { listSearchFacets, searchListings } from "./repository";

/*
 * The dated-search price path end to end, against a real schema: the projection that fills
 * `listing_period_price`, and the search that reads it for the card, the sort, the filter and
 * the slider. Three listings cover the three things a dated card can be showing:
 *
 *   alpha   priced by two vendors, each winning a different week; one week taken
 *   bravo   priced for the first week only, cheaper than anything alpha has, and the searched
 *           week refused, so nothing prices that week for it
 *   charlie never priced by a vendor, only a published seasonal rate, which prices the searched
 *           week from the operator's list
 */

const DAY = 86_400_000;

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/* A Saturday far enough ahead that no lead-time rule touches it while the suite runs. */
function saturdayAhead() {
  const date = new Date(Date.now() + 60 * DAY);
  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));
  return date;
}

const start = saturdayAhead();
const week = (n: number) => iso(new Date(start.getTime() + 7 * n * DAY));
const W1 = week(0);
const W2 = week(1);
const W3 = week(2);
const W4 = week(3);

let test: TestDatabase;

async function offerFor(
  db: TestDatabase["db"],
  id: string,
  listingId: string,
  providerId: string,
  crewType: string,
) {
  await db.insert(providerRecord).values({
    id: `prec_${id}`,
    providerId,
    resourceType: "yacht",
    externalId: id,
  });
  await db.insert(listingSource).values({
    id: `lsrc_${id}`,
    listingId,
    providerRecordId: `prec_${id}`,
    externalYachtId: id,
  });
  await db.insert(listingOffer).values({
    id,
    listingId,
    listingSourceId: `lsrc_${id}`,
    providerId,
    operatorId: "op_test",
    homeBaseId: "base_test",
    crewType,
    defaultCurrency: "EUR",
  });
}

function priced(
  offerId: string,
  listingId: string,
  from: string,
  to: string,
  money: { price: number; extras: number; list?: number },
) {
  return {
    listingId,
    listingOfferId: offerId,
    startDate: from,
    endDate: to,
    status: "available" as const,
    priceMinor: money.price,
    obligatoryExtrasMinor: money.extras,
    listPriceMinor: money.list ?? null,
    currency: "EUR",
  };
}

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await db.insert(operator).values({ id: "op_test", name: "Test Charter", slug: "test-charter" });
  await db.insert(country).values({ id: "cty_test", code: "GR", name: "Greece" });
  await db.insert(region).values({ id: "rgn_test", countryId: "cty_test", name: "Saronic Gulf" });
  await db.insert(location).values({ id: "loc_test", regionId: "rgn_test", name: "Lavrion" });
  await db.insert(base).values({ id: "base_test", locationId: "loc_test", name: "Olympic Marine" });
  await db.insert(provider).values([
    { id: "prov_bm", code: "booking_manager", name: "Booking Manager" },
    { id: "prov_ns", code: "nausys", name: "NauSYS" },
  ]);
  await db.insert(listing).values(
    ["alpha", "bravo", "charlie"].map((slug) => ({
      id: `lst_${slug}`,
      slug,
      title: slug,
      operatorId: "op_test",
      homeBaseId: "base_test",
      status: "published" as const,
    })),
  );

  await offerFor(db, "off_alpha_bm", "lst_alpha", "prov_bm", "full-crew");
  await offerFor(db, "off_alpha_ns", "lst_alpha", "prov_ns", "bareboat");
  await offerFor(db, "off_bravo", "lst_bravo", "prov_ns", "bareboat");
  await offerFor(db, "off_charlie", "lst_charlie", "prov_ns", "bareboat");

  await db.insert(availabilitySlot).values([
    priced("off_alpha_bm", "lst_alpha", W1, W2, { price: 637_500, extras: 365_000, list: 850_000 }),
    priced("off_alpha_bm", "lst_alpha", W2, W3, { price: 600_000, extras: 365_000 }),
    priced("off_alpha_bm", "lst_alpha", W3, W4, { price: 500_000, extras: 365_000 }),
    /* Sold after the sweep priced the week above, so that week is no longer for sale. */
    {
      listingId: "lst_alpha",
      listingOfferId: "off_alpha_bm",
      startDate: iso(new Date(Date.parse(W3) + DAY)),
      endDate: iso(new Date(Date.parse(W3) + 3 * DAY)),
      status: "occupied" as const,
    },
    priced("off_alpha_ns", "lst_alpha", W1, W2, { price: 700_000, extras: 400_000 }),
    priced("off_alpha_ns", "lst_alpha", W2, W3, { price: 580_000, extras: 400_000 }),
    priced("off_bravo", "lst_bravo", W1, W2, { price: 300_000, extras: 50_000 }),
  ]);
  await db.insert(listingRefusedPeriod).values({
    listingId: "lst_bravo",
    listingOfferId: "off_bravo",
    startDate: W2,
    endDate: W3,
  });

  /* The cook a full-crew charter is sold with, which the confirmed extras total does not carry. */
  await db.insert(providerExtraCatalogue).values({
    listingId: "lst_alpha",
    listingOfferId: "off_alpha_bm",
    source: "booking_manager",
    kind: "service",
    externalId: "cook",
    name: "Cook",
    crewRole: "cook",
    priceMinor: 140_000,
    priceMeasure: "per week",
  });

  const offers = [
    ["lst_alpha", "off_alpha_bm", 900_000],
    ["lst_alpha", "off_alpha_ns", 900_000],
    ["lst_bravo", "off_bravo", 900_000],
    /* Charlie's only price: the season's published weekly rate, which vendors sell below. */
    ["lst_charlie", "off_charlie", 400_000],
  ] as const;

  /* Saturday to Saturday, a week at least, as the fleet mostly sells. Search admits a boat only
     where a rule and a published rate cover the dates. */
  await db.insert(listingCheckinRule).values(
    offers.map(([listingId, listingOfferId]) => ({
      listingId,
      listingOfferId,
      checkinWeekday: 6,
      checkoutWeekday: 6,
      minNights: 7,
    })),
  );
  await db.insert(listingPricePeriod).values(
    offers.map(([listingId, listingOfferId, priceMinor]) => ({
      listingId,
      listingOfferId,
      startDate: W1,
      endDate: W4,
      kind: "weekly" as const,
      priceMinor,
      currency: "EUR",
    })),
  );

  await db.insert(listingFreePeriod).values(
    [
      ["lst_alpha", "off_alpha_bm", W3],
      ["lst_alpha", "off_alpha_ns", W4],
      ["lst_bravo", "off_bravo", W4],
      ["lst_charlie", "off_charlie", W4],
    ].map(([listingId, listingOfferId, endDate]) => ({
      listingId: listingId!,
      listingOfferId: listingOfferId!,
      startDate: W1,
      endDate: endDate!,
    })),
  );

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const dated = { startDate: W2, duration: 7, priceBasis: "base" as const, locale: "en" };

describe("listing_period_price", () => {
  it("prices every sellable week a vendor confirmed, with the best offer per week", async () => {
    const rows = await test.db.execute<{
      listing_id: string;
      start_date: string;
      offer_id: string;
      base_minor: number;
      all_in_minor: number;
      list_all_in_minor: number | null;
    }>(sql`
      select listing_id, start_date::text, offer_id, base_minor, all_in_minor, list_all_in_minor
      from listing_period_price
      order by listing_id, start_date
    `);

    expect(rows.rows).toEqual([
      /* Cheaper rate wins; its cook rides along, and the discount is added back for the strike. */
      {
        listing_id: "lst_alpha",
        start_date: W1,
        offer_id: "off_alpha_bm",
        base_minor: 637_500,
        all_in_minor: 637_500 + 365_000 + 140_000,
        list_all_in_minor: 637_500 + 365_000 + 140_000 + (850_000 - 637_500),
      },
      /* The other vendor is cheaper this week, so it wins this week. The taken week is absent. */
      {
        listing_id: "lst_alpha",
        start_date: W2,
        offer_id: "off_alpha_ns",
        base_minor: 580_000,
        all_in_minor: 580_000 + 400_000,
        list_all_in_minor: null,
      },
      {
        listing_id: "lst_bravo",
        start_date: W1,
        offer_id: "off_bravo",
        base_minor: 300_000,
        all_in_minor: 350_000,
        list_all_in_minor: null,
      },
    ]);
  });

  it("agrees to the cent with each listing's document for the document's own week", async () => {
    const rows = await test.db.execute<{ own_week: number; mismatched: number }>(sql`
      select
        count(*)::int as own_week,
        count(*) filter (
          where pp.all_in_minor is distinct from doc.price_from_minor
             or pp.base_minor is distinct from doc.base_price_from_minor
             or pp.list_all_in_minor is distinct from doc.list_price_from_minor
             or pp.offer_id is distinct from doc.best_offer_id
        )::int as mismatched
      from listing_search_doc doc
      join listing_period_price pp
        on pp.listing_id = doc.listing_id
       and pp.start_date = doc.bookable_from
       and pp.end_date = doc.bookable_to
      where not doc.price_is_from
    `);

    expect(rows.rows[0]).toEqual({ own_week: 2, mismatched: 0 });
  });
});

describe("a dated search", () => {
  const summary = (items: Awaited<ReturnType<typeof searchListings>>["items"]) =>
    items.map((item) => ({
      slug: item.slug,
      base: item.basePriceFromMinor,
      pricedForDates: item.pricedForDates,
      priceSource: item.priceSource,
      priceIsFrom: item.priceIsFrom,
      bookableFrom: item.bookableFrom,
    }));

  it("prices the dates asked for, and keeps another week's price as what it is", async () => {
    const result = await searchListings(test.db, { ...dated, sort: "price-asc" });

    expect(summary(result.items)).toEqual([
      /* The list rate for the searched week sorts on the figure its card shows. */
      {
        slug: "charlie",
        base: 400_000,
        pricedForDates: true,
        priceSource: "price-list",
        priceIsFrom: false,
        bookableFrom: W2,
      },
      {
        slug: "alpha",
        base: 580_000,
        pricedForDates: true,
        priceSource: "vendor",
        priceIsFrom: false,
        bookableFrom: W2,
      },
      /* Cheaper than both, but for another week, so it ranks behind every price for these dates. */
      {
        slug: "bravo",
        base: 300_000,
        pricedForDates: false,
        priceSource: null,
        priceIsFrom: false,
        bookableFrom: W1,
      },
    ]);
  });

  it("ranks prices for the dates first when dearest comes first too", async () => {
    const result = await searchListings(test.db, { ...dated, sort: "price-desc" });
    expect(result.items.map((item) => item.slug)).toEqual(["alpha", "charlie", "bravo"]);
  });

  it("recommends the vendor's price, then the list rate, then another week's price", async () => {
    const result = await searchListings(test.db, { ...dated, sort: "recommended" });
    expect(result.items.map((item) => item.slug)).toEqual(["alpha", "charlie", "bravo"]);
  });

  it("pages the recommended order by cursor without skipping or repeating", async () => {
    const slugs: string[] = [];
    /* Above every recommended value, so the first page starts at the top of the order. */
    let cursor: string | undefined = encodeSearchCursor({ value: 100, listingId: "~" });
    do {
      const page = await searchListings(test.db, {
        ...dated,
        sort: "recommended",
        limit: 1,
        cursor,
      });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(["alpha", "charlie", "bravo"]);
  });

  it("filters on prices for the dates, not on another week's", async () => {
    const result = await searchListings(test.db, { ...dated, maxPriceMinor: 700_000 });
    expect(result.items.map((item) => item.slug)).toEqual(["alpha", "charlie"]);
  });

  it("bounds the price slider by prices for the dates", async () => {
    const facets = await listSearchFacets(test.db, dated);
    expect(facets.priceRange).toMatchObject({ minMinor: 400_000, maxMinor: 580_000 });
  });

  it("leaves an undated search on each listing's own week", async () => {
    const result = await searchListings(test.db, {
      priceBasis: "base",
      locale: "en",
      sort: "price-asc",
    });

    expect(summary(result.items)).toEqual([
      {
        slug: "bravo",
        base: 300_000,
        pricedForDates: undefined,
        priceSource: undefined,
        priceIsFrom: false,
        bookableFrom: W1,
      },
      {
        slug: "alpha",
        base: 637_500,
        pricedForDates: undefined,
        priceSource: undefined,
        priceIsFrom: false,
        bookableFrom: W1,
      },
      {
        slug: "charlie",
        base: 400_000,
        pricedForDates: undefined,
        priceSource: undefined,
        priceIsFrom: true,
        bookableFrom: W1,
      },
    ]);
  });
});
