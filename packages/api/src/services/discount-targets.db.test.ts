import "../test-support/checkout-env";

import { user } from "@yacht-charter/db/schema/auth";
import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import { listing } from "@yacht-charter/db/schema/listing";
import { operator } from "@yacht-charter/db/schema/operator";
import { yachtCategory } from "@yacht-charter/db/schema/taxonomy";
import { discount, discountTarget } from "@yacht-charter/db/schema/discount";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NotFoundError } from "../errors";
import { createDiscount } from "./discount-admin";
import { resolveDiscountForListing } from "./discount-redemption";

/*
 * The categories a real sync leaves behind: one row per vendor wording, grouped by canonical name,
 * with ids minted by this database. Nothing is called `cat_motor`.
 */
const CATEGORIES = [
  { id: "cat_nausys_101", code: "nausys:101", name: "Motor yacht", canonicalName: "Motor yacht" },
  {
    id: "cat_bm_motoryacht",
    code: "booking_manager:motoryacht",
    name: "Motoryacht",
    canonicalName: "Motor yacht",
  },
  { id: "cat_nausys_51", code: "nausys:51", name: "Catamaran", canonicalName: "Catamaran" },
];

const BOATS = [
  { id: "lst_nausys_motor", categoryId: "cat_nausys_101" },
  { id: "lst_bm_motor", categoryId: "cat_bm_motoryacht" },
  { id: "lst_catamaran", categoryId: "cat_nausys_51" },
];

describe("category discount targets", () => {
  let test: TestDatabase;

  beforeAll(async () => {
    test = await createTestDatabase();
    const { db } = test;
    await db.insert(user).values({ id: "usr_admin", name: "Admin", email: "admin@example.test" });
    await db.insert(operator).values({ id: "op_d", name: "Discounts", slug: "discounts" });
    await db.insert(country).values({ id: "cty_d", code: "HR", name: "Croatia" });
    await db.insert(region).values({ id: "rgn_d", countryId: "cty_d", name: "Split" });
    await db.insert(location).values({ id: "loc_d", regionId: "rgn_d", name: "Split" });
    await db.insert(base).values({ id: "base_d", locationId: "loc_d", name: "ACI Marina Split" });
    await db.insert(yachtCategory).values(CATEGORIES);
    await db.insert(listing).values(
      BOATS.map((boat) => ({
        ...boat,
        slug: boat.id,
        title: boat.id,
        operatorId: "op_d",
        homeBaseId: "base_d",
        status: "published" as const,
      })),
    );

    await createDiscount(db, "usr_admin", {
      name: "Motor Only",
      code: "MOTORONLY",
      type: "percentage",
      valuePct: 10,
      targets: [{ targetType: "category", targetId: "Motor yacht" }],
    });
  });

  afterAll(async () => {
    await test?.drop();
  });

  const appliesTo = async (code: string, listingId: string) =>
    "discount" in (await resolveDiscountForListing(test.db, code, listingId));

  it("applies a group target to every vendor's category in the group, and to nothing else", async () => {
    expect(await appliesTo("MOTORONLY", "lst_nausys_motor")).toBe(true);
    expect(await appliesTo("MOTORONLY", "lst_bm_motor")).toBe(true);
    expect(await appliesTo("MOTORONLY", "lst_catamaran")).toBe(false);
  });

  it("names the group in the admin list", async () => {
    const created = await createDiscount(test.db, "usr_admin", {
      name: "Cats",
      code: "CATS",
      type: "percentage",
      valuePct: 5,
      targets: [{ targetType: "category", targetId: "Catamaran" }],
    });

    expect(created.targets).toEqual([
      { targetType: "category", targetId: "Catamaran", targetLabel: "Catamaran" },
    ]);
  });

  it("refuses a group no category belongs to, such as the seed's id on a synced catalogue", async () => {
    await expect(
      createDiscount(test.db, "usr_admin", {
        name: "Seed id",
        code: "SEEDID",
        type: "percentage",
        valuePct: 5,
        targets: [{ targetType: "category", targetId: "cat_motor" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("still matches a target written as a category id", async () => {
    const [row] = await test.db
      .insert(discount)
      .values({ name: "By id", code: "BYID", type: "percentage", valuePct: "5.0000" })
      .returning({ id: discount.id });
    await test.db
      .insert(discountTarget)
      .values({ discountId: row?.id ?? "", targetType: "category", targetId: "cat_bm_motoryacht" });

    expect(await appliesTo("BYID", "lst_bm_motor")).toBe(true);
    expect(await appliesTo("BYID", "lst_nausys_motor")).toBe(false);
  });
});
