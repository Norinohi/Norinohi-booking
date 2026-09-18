import { provider, providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pruneOrphanedRawPayloads } from "./raw-retention";

let test: TestDatabase;

const PROVIDER = "prov_prune";
const OTHER = "prov_prune_other";
const old = sql`now() - interval '2 days'`;

beforeAll(async () => {
  test = await createTestDatabase();
  await test.db.insert(provider).values([
    { id: PROVIDER, code: "prune_a", name: "A", enabled: true, defaultCurrency: "EUR" },
    { id: OTHER, code: "prune_b", name: "B", enabled: true, defaultCurrency: "EUR" },
  ]);
  await test.db.insert(providerRawPayload).values([
    { id: "praw_current", providerId: PROVIDER, payload: {}, createdAt: old },
    { id: "praw_replaced_1", providerId: PROVIDER, payload: {}, createdAt: old },
    { id: "praw_replaced_2", providerId: PROVIDER, payload: {}, createdAt: old },
    { id: "praw_replaced_3", providerId: PROVIDER, payload: {}, createdAt: old },
    // Stands for a payload whose record is still being written in another transaction.
    { id: "praw_fresh", providerId: PROVIDER, payload: {} },
    { id: "praw_other_provider", providerId: OTHER, payload: {}, createdAt: old },
  ]);
  await test.db.insert(providerRecord).values({
    providerId: PROVIDER,
    resourceType: "yacht",
    externalId: "1",
    rawPayloadId: "praw_current",
  });
});

afterAll(async () => {
  await test?.drop();
});

describe("pruneOrphanedRawPayloads", () => {
  it("deletes only this provider's unreferenced payloads older than the grace", async () => {
    await expect(pruneOrphanedRawPayloads(test.db, PROVIDER, { batchSize: 2 })).resolves.toBe(3);

    const left = await test.db
      .select({ id: providerRawPayload.id })
      .from(providerRawPayload)
      .orderBy(providerRawPayload.id);
    expect(left.map((row) => row.id)).toEqual([
      "praw_current",
      "praw_fresh",
      "praw_other_provider",
    ]);

    const [record] = await test.db
      .select({ rawPayloadId: providerRecord.rawPayloadId })
      .from(providerRecord)
      .where(eq(providerRecord.providerId, PROVIDER));
    expect(record?.rawPayloadId).toBe("praw_current");
  });
});
