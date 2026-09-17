import "../test-support/checkout-env";

import { auditLog } from "@yacht-charter/db/schema/admin";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";
import { cancelBooking } from "./booking";
import { getMarketplaceSettings, updateMarketplaceSettings } from "./marketplace-settings";

/*
 * Staff cancelling a booking and saving the marketplace settings each leave one audit entry,
 * written in the same transaction as the change. A customer cancelling their own booking does not.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;
let staffId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  staffId = await seedCustomer(test.db, "usr_staff");
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function heldBookingOn(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);
  return { userId, bookingId: hold.bookingId };
}

function auditFor(entityType: string, entityId: string) {
  return test.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)));
}

describe("booking cancellation", () => {
  it("audits a staff cancel with the actor, both statuses and the reason", async () => {
    const { db } = test;
    const { bookingId } = await heldBookingOn("staffcancel");

    const result = await cancelBooking(db, inventory, bookingId, "Operator withdrew the yacht", {
      userId: staffId,
      isAdmin: true,
    });

    expect(result.status).toBe("CANCELLED");
    expect(await auditFor("booking", bookingId)).toEqual([
      expect.objectContaining({
        actorUserId: staffId,
        action: "update",
        before: { status: "OPTION_HELD" },
        after: { status: "CANCELLED", cancelReason: "Operator withdrew the yacht" },
        metadata: { reason: "Operator withdrew the yacht" },
      }),
    ]);
  });

  it("writes nothing when the customer cancels their own booking", async () => {
    const { db } = test;
    const { userId, bookingId } = await heldBookingOn("selfcancel");

    const result = await cancelBooking(db, inventory, bookingId, undefined, {
      userId,
      isAdmin: false,
    });

    expect(result.status).toBe("CANCELLED");
    expect(await auditFor("booking", bookingId)).toEqual([]);
  });

  it("writes no entry for a cancel the state machine refuses", async () => {
    const { db } = test;
    const { bookingId } = await heldBookingOn("twicecancel");
    const actor = { userId: staffId, isAdmin: true };

    await cancelBooking(db, inventory, bookingId, undefined, actor);
    await expect(cancelBooking(db, inventory, bookingId, undefined, actor)).rejects.toMatchObject({
      kind: "CONFLICT",
    });

    expect(await auditFor("booking", bookingId)).toHaveLength(1);
    expect((await bookingState(db, bookingId)).booking.status).toBe("CANCELLED");
  });
});

describe("marketplace settings", () => {
  it("audits a save with the settings before and after", async () => {
    const { db } = test;
    const current = await getMarketplaceSettings(db);

    await updateMarketplaceSettings(db, {
      payment: current.payment,
      transactingPreference: current.transactingPreference,
      offerRankingUsesBasePrice: current.offerRankingUsesBasePrice,
      catalogueShowsBasePrice: current.catalogueShowsBasePrice,
      offerRankingUsesReliability: current.offerRankingUsesReliability,
      reliabilityWindowDays: current.reliabilityWindowDays + 1,
      displayCurrencyEnabled: current.displayCurrencyEnabled,
      displayCurrencyDefault: current.displayCurrencyDefault,
      displayCurrencyByCountry: current.displayCurrencyByCountry,
      nameSearchEnabled: current.nameSearchEnabled,
      actorUserId: staffId,
    });

    const [entry, ...rest] = await auditFor("marketplace_settings", "singleton");

    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorUserId: staffId,
      action: "update",
      before: { reliabilityWindowDays: current.reliabilityWindowDays },
      after: { reliabilityWindowDays: current.reliabilityWindowDays + 1 },
    });
    expect(entry?.after).not.toHaveProperty("updatedAt");
  });
});
