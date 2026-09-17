import "../test-support/checkout-env";

import { listingOffer, operator } from "@yacht-charter/db/schema/index";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedBookingWorld, seedCustomer, seedYacht } from "../test-support/booking-world";
import { createCommission, listOperatorOptions, updateCommission } from "./commission-admin";

/*
 * The rate form's operator picker and the save behind it, against operators the way the syncs
 * write them: one row per vendor company, so the same name can belong to two vendors.
 *
 *   op_test   "Test Charter", sells through mock (seeded by the booking world)
 *   op_twin   "Test Charter", sells through nausys
 *   op_idle   "Test Charter Idle", no offers at all
 */

let test: TestDatabase;
let staffId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedBookingWorld(db);
  await seedYacht(db, "mockboat");
  await db.insert(operator).values([
    { id: "op_twin", name: "Test Charter", slug: "nausys-test-charter-1" },
    { id: "op_idle", name: "Test Charter Idle", slug: "test-charter-idle" },
  ]);
  const { listingId } = await seedYacht(db, "nausysboat");
  await db
    .update(listingOffer)
    .set({ providerId: "prov_ns", operatorId: "op_twin" })
    .where(eq(listingOffer.listingId, listingId));
  staffId = await seedCustomer(db, "usr_staff");
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("operator options", () => {
  it("names the vendors behind each operator when no vendor is chosen", async () => {
    const { items } = await listOperatorOptions(test.db, { query: "Test Charter" });

    expect(items).toEqual([
      { id: "op_test", name: "Test Charter", providers: ["mock"] },
      { id: "op_twin", name: "Test Charter", providers: ["nausys"] },
      { id: "op_idle", name: "Test Charter Idle", providers: [] },
    ]);
  });

  it("offers only the chosen vendor's operators", async () => {
    const { items } = await listOperatorOptions(test.db, {
      query: "Test Charter",
      provider: "nausys",
    });

    expect(items).toEqual([{ id: "op_twin", name: "Test Charter", providers: ["nausys"] }]);
  });
});

describe("saving a rate", () => {
  it("refuses an operator the chosen vendor does not sell", async () => {
    await expect(
      createCommission(test.db, staffId, {
        provider: "nausys",
        operatorId: "op_test",
        ratePct: 10,
      }),
    ).rejects.toMatchObject({
      kind: "BAD_REQUEST",
      data: { code: "OPERATOR_NOT_SOLD_BY_PROVIDER" },
    });
  });

  it("accepts a matching operator, and a vendor-wide rate with none", async () => {
    const scoped = await createCommission(test.db, staffId, {
      provider: "nausys",
      operatorId: "op_twin",
      ratePct: 12,
    });
    const wide = await createCommission(test.db, staffId, {
      provider: "mock",
      operatorId: null,
      ratePct: 8,
    });

    expect(scoped).toMatchObject({ provider: "nausys", operatorId: "op_twin" });
    expect(wide).toMatchObject({ provider: "mock", operatorId: null });
  });

  it("refuses moving a rate to a vendor its operator is not sold by", async () => {
    const rate = await createCommission(test.db, staffId, {
      provider: "mock",
      operatorId: "op_test",
      ratePct: 5,
    });

    await expect(
      updateCommission(test.db, staffId, { id: rate.id, provider: "nausys" }),
    ).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    await expect(
      updateCommission(test.db, staffId, { id: rate.id, ratePct: 6 }),
    ).resolves.toMatchObject({ ratePct: 6 });
  });
});
