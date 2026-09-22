import "../test-support/checkout-env";

import {
  availabilitySlot,
  booking,
  listingOffer,
  listingRefusedPeriod,
  quote,
} from "@yacht-charter/db/schema/index";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import {
  ContractError,
  ROUTE_NOT_OFFERED,
  SlotUnavailableError,
} from "@yacht-charter/providers/shared/errors";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
  WEEK_START,
  weekOnSale,
} from "../test-support/booking-world";
import { installFakeStripe, type FakeStripe } from "../test-support/fake-stripe";
import { confirmCheckout } from "./payment";
import { repriceQuote } from "./quote";

/*
 * Every way the chain refuses before money moves, and what each refusal leaves behind.
 *
 *   gone       the slot is booked before anyone quotes it
 *   stale      the quote runs out before the hold, or before the payment
 *   moved      the provider says the price changed, or the week went, when asked to hold it
 *   taken      a second customer reaches the option the first one already holds
 *   operator   the operator approves every option by hand, so checkout will not hold it
 *
 * A refused hold must never reach Stripe, so the fake's create is asserted untouched throughout.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;
let stripe: FakeStripe;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  stripe = installFakeStripe();
}, 120_000);

afterAll(async () => {
  expect(stripe.create).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  await test?.drop();
});

async function quoteOn(slug: string, options: { operatorConfirms?: boolean } = {}) {
  const { db } = test;
  const yacht = await seedYacht(db, slug, options);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const priced = await quoteWeek(db, inventory, yacht.listingId, userId);
  return { ...yacht, userId, quoteId: priced.quoteId };
}

describe("slot unavailable at quote time", () => {
  it("refuses to price a week the provider no longer sells", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "gone");
    const userId = await seedCustomer(db, "usr_gone");
    await db
      .update(availabilitySlot)
      .set({ status: "occupied" })
      .where(eq(availabilitySlot.listingId, listingId));

    await expect(quoteWeek(db, inventory, listingId, userId)).rejects.toMatchObject({
      kind: "CONFLICT",
      message: "Requested slot is not available",
    });
    expect(await db.select().from(quote).where(eq(quote.listingId, listingId))).toEqual([]);
  });
});

describe("stale quote", () => {
  it("refuses to hold a quote past its expiry and marks it expired", async () => {
    const { db } = test;
    const { userId, quoteId } = await quoteOn("stale");
    await db
      .update(quote)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(quote.id, quoteId));

    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "QUOTE_EXPIRED", quoteId },
    });

    const [row] = await db.select().from(quote).where(eq(quote.id, quoteId));
    expect(row?.status).toBe("expired");
    expect(await db.select().from(booking).where(eq(booking.quoteId, quoteId))).toEqual([]);
  });

  it("refuses to take a deposit once the held quote has expired", async () => {
    const { db } = test;
    const { userId, quoteId } = await quoteOn("unpaid");
    const hold = await holdQuote(db, inventory, userId, quoteId);
    await db
      .update(quote)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(quote.id, quoteId));

    await expect(confirmCheckout(db, userId, hold.bookingId, "deposit")).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "QUOTE_EXPIRED" },
    });
    expect((await bookingState(db, hold.bookingId)).payments).toEqual([]);
  });
});

describe("provider refuses the hold", () => {
  it("rejects a moved price as a provider refusal, and a replay says so again", async () => {
    const { db } = test;
    const { listingId, userId, quoteId } = await quoteOn("moved");
    vi.spyOn(inventory, "createOption").mockRejectedValueOnce(
      new ContractError("PRICE_CHANGED: the price moved between the quote and the hold", {
        providerCode: "PRICE_CHANGED",
      }),
    );

    const refusal = { kind: "CONFLICT", data: { code: "PROVIDER_REFUSED" } };
    await expect(holdQuote(db, inventory, userId, quoteId, "key-moved")).rejects.toMatchObject(
      refusal,
    );

    const [row] = await db.select().from(booking).where(eq(booking.quoteId, quoteId));
    if (!row) throw new Error("the refused hold left no booking");
    const state = await bookingState(db, row.id);

    expect(state.booking).toMatchObject({ status: "PROVIDER_REJECTED", providerOptionId: null });
    expect(state.booking.cancelReason).toMatch(/could not complete this booking/);
    expect(state.quote?.status).toBe("consumed");
    expect(state.events).toMatchObject([
      { kind: "confirm_failed", payload: { message: expect.stringMatching(/^PRICE_CHANGED/) } },
    ]);
    expect(state.outbox).toEqual([]);
    expect(await weekOnSale(db, listingId)).toBe(true);

    await expect(holdQuote(db, inventory, userId, quoteId, "key-moved")).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "HOLD_NEVER_HELD" },
    });
  });

  it("names a week the provider says is gone", async () => {
    const { db } = test;
    const { userId, quoteId } = await quoteOn("sold");
    vi.spyOn(inventory, "createOption").mockRejectedValueOnce(
      new SlotUnavailableError("Yacht already booked for this period"),
    );

    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "SLOT_GONE" },
    });

    const [row] = await db.select().from(booking).where(eq(booking.quoteId, quoteId));
    expect(row?.status).toBe("PROVIDER_REJECTED");
  });
});

/*
 * A vendor that sells the week, only not on the base pair the customer pinned, has not sold the
 * week: refusing the pair must not take it off the card for everyone else.
 *
 * The world quotes four guests, so a refusal that is learned from first asks the vendor again for
 * two. Each refusal therefore stands for every quote in the test, and neither the probe nor a
 * refused period may follow a route refusal.
 */
describe("provider refuses only the pinned route", () => {
  const routeRefused = () =>
    new SlotUnavailableError("sold from another base pair", { providerCode: ROUTE_NOT_OFFERED });
  const weekGone = () =>
    new SlotUnavailableError("no offer for that week", { providerCode: "NO_OFFER" });
  const refusedPeriods = (listingId: string) =>
    test.db
      .select({ startDate: listingRefusedPeriod.startDate })
      .from(listingRefusedPeriod)
      .where(eq(listingRefusedPeriod.listingId, listingId));
  const spies: { mockRestore(): void }[] = [];
  const refuse = (method: "createOption" | "getQuote", error: () => Error) => {
    const spy = vi.spyOn(inventory, method).mockRejectedValue(error());
    spies.push(spy);
    return spy;
  };

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
  });

  it("writes no refusal when the hold is refused for the route", async () => {
    const { db } = test;
    const { listingId, userId, quoteId } = await quoteOn("route-hold");
    refuse("createOption", routeRefused);
    const getQuote = refuse("getQuote", routeRefused);

    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "SLOT_GONE" },
    });

    expect(getQuote).not.toHaveBeenCalled();
    expect(await refusedPeriods(listingId)).toEqual([]);
  });

  it("writes the week down as refused when the hold is refused for the week", async () => {
    const { db } = test;
    const { listingId, userId, quoteId } = await quoteOn("gone-hold");
    refuse("createOption", weekGone);
    const getQuote = refuse("getQuote", weekGone);

    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "SLOT_GONE" },
    });

    expect(getQuote).toHaveBeenCalledWith(expect.objectContaining({ guests: 2 }));
    expect(await refusedPeriods(listingId)).toEqual([{ startDate: WEEK_START }]);
  });

  it("writes no refusal when a re-price is refused for the route", async () => {
    const { db } = test;
    const { listingId, userId, quoteId } = await quoteOn("route-reprice");
    const getQuote = refuse("getQuote", routeRefused);

    await expect(repriceQuote(db, inventory, quoteId, userId, { guests: 3 })).rejects.toMatchObject(
      { kind: "CONFLICT", message: "Requested slot is not available" },
    );

    expect(getQuote).toHaveBeenCalledTimes(1);
    expect(await refusedPeriods(listingId)).toEqual([]);
  });

  it("writes the week down as refused when a re-price is refused for the week", async () => {
    const { db } = test;
    const { listingId, userId, quoteId } = await quoteOn("gone-reprice");
    const getQuote = refuse("getQuote", weekGone);

    await expect(repriceQuote(db, inventory, quoteId, userId, { guests: 3 })).rejects.toMatchObject(
      { kind: "CONFLICT", message: "Requested slot is not available" },
    );

    expect(getQuote).toHaveBeenCalledTimes(2);
    expect(await refusedPeriods(listingId)).toEqual([{ startDate: WEEK_START }]);
  });
});

describe("slot taken by another checkout", () => {
  it("refuses a second live booking on the option the first one holds", async () => {
    const { db } = test;
    const first = await quoteOn("taken");
    const secondUser = await seedCustomer(db, "usr_taken_late");
    const second = await quoteWeek(db, inventory, first.listingId, secondUser);

    const held = await holdQuote(db, inventory, first.userId, first.quoteId);

    await expect(holdQuote(db, inventory, secondUser, second.quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "SLOT_TAKEN" },
    });

    const [late] = await db.select().from(booking).where(eq(booking.quoteId, second.quoteId));
    expect(late).toMatchObject({
      status: "PROVIDER_REJECTED",
      cancelReason: "This slot was taken while you were checking out",
    });
    expect((await bookingState(db, held.bookingId)).booking.status).toBe("OPTION_HELD");
  });
});

describe("operator confirmation required", () => {
  it("quotes the yacht but refuses to hold it online", async () => {
    const { db } = test;
    const { offerId, userId, quoteId } = await quoteOn("approval", { operatorConfirms: true });
    const createOption = vi.spyOn(inventory, "createOption");

    const [offer] = await db.select().from(listingOffer).where(eq(listingOffer.id, offerId));
    expect(offer?.optionApprovalRequired).toBe(true);

    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "OPERATOR_CONFIRMATION_REQUIRED" },
    });

    expect(createOption).not.toHaveBeenCalled();
    expect(await db.select().from(booking).where(eq(booking.quoteId, quoteId))).toEqual([]);
    const [row] = await db.select().from(quote).where(eq(quote.id, quoteId));
    expect(row).toMatchObject({ status: "active", listingOfferId: offerId });
    createOption.mockRestore();
  });
});
