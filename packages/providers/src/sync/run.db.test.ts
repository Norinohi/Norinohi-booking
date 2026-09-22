import { provider, syncRun } from "@yacht-charter/db/schema/provider";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openSyncRun, releaseSyncRun, SyncAlreadyRunningError } from "./run";

let test: TestDatabase;
const opened: string[] = [];

beforeAll(async () => {
  test = await createTestDatabase();
  await test.db.insert(provider).values([
    { id: "prov_nausys", code: "nausys", name: "NauSYS", enabled: true, defaultCurrency: "EUR" },
    {
      id: "prov_bm",
      code: "booking_manager",
      name: "Booking Manager",
      enabled: true,
      defaultCurrency: "EUR",
    },
  ]);
}, 120_000);

afterAll(async () => {
  for (const id of opened) releaseSyncRun(id);
  await test?.drop();
});

async function open(providerId: string, kind: "catalogue" | "availability" | "media") {
  const id = await openSyncRun(test.db, providerId, kind);
  opened.push(id);
  return id;
}

/*
 * NauSYS answers parallel calls on one credential with 429, and its exemption covers only live
 * booking calls. The in-flight lock was per kind, so the nightly catalogue and the half-hourly
 * availability run called the vendor side by side from two processes.
 */
describe("one NauSYS vendor run at a time", () => {
  it("refuses availability while the catalogue walk is in flight", async () => {
    await open("prov_nausys", "catalogue");

    await expect(openSyncRun(test.db, "prov_nausys", "availability")).rejects.toBeInstanceOf(
      SyncAlreadyRunningError,
    );
  });

  it("still lets media cleanup run, which never calls the vendor", async () => {
    await expect(open("prov_nausys", "media")).resolves.toEqual(expect.any(String));
  });

  it("opens availability once the catalogue run is over", async () => {
    await test.db
      .update(syncRun)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(syncRun.providerId, "prov_nausys"));

    await expect(open("prov_nausys", "availability")).resolves.toEqual(expect.any(String));
  });

  it("still lets NauSYS open a run while Booking Manager holds one", async () => {
    await test.db
      .update(syncRun)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(syncRun.providerId, "prov_nausys"));
    await open("prov_bm", "catalogue");

    await expect(open("prov_nausys", "catalogue")).resolves.toEqual(expect.any(String));
  });
});

/*
 * Booking Manager blocks the whole account past 20 calls in flight, until the vendor's nightly
 * restart. A catalogue walk and an availability pass side by side would each spend the sweep
 * budget, from two processes that cannot see each other's lanes.
 */
describe("one Booking Manager vendor run at a time", () => {
  it("refuses availability, price weeks included, while the catalogue walk is in flight", async () => {
    await expect(openSyncRun(test.db, "prov_bm", "availability")).rejects.toBeInstanceOf(
      SyncAlreadyRunningError,
    );
  });

  it("refuses the catalogue walk while availability is in flight", async () => {
    await test.db
      .update(syncRun)
      .set({ status: "success", finishedAt: new Date() })
      .where(eq(syncRun.providerId, "prov_bm"));
    await open("prov_bm", "availability");

    await expect(openSyncRun(test.db, "prov_bm", "catalogue")).rejects.toBeInstanceOf(
      SyncAlreadyRunningError,
    );
  });
});
