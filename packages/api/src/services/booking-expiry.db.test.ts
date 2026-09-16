import "../test-support/checkout-env";

import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { TransientError } from "@yacht-charter/providers/shared/errors";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
  weekOnSale,
} from "../test-support/booking-world";
import {
  deliver,
  eventBody,
  installFakeStripe,
  type FakeStripe,
} from "../test-support/fake-stripe";
import { confirmCheckout } from "./payment";
import { sweepExpiries } from "./expiry";

/*
 * What the expiry job does to a checkout nobody finished, run with its own clock moved forward
 * rather than by waiting.
 *
 *   lapsed     a hold past `hold_expires_at` is released at the provider and gives the week back
 *   refused    the provider will not take the release: the booking expires all the same
 *   abandoned  a declined card nobody retried for five days is reaped like a lapsed hold
 *
 * The mock provider holds an option for 48 hours. Each case books its own yacht and asserts only
 * on its own booking, because every sweep walks the whole table.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let test: TestDatabase;
let inventory: MockInventoryProvider;
let stripe: FakeStripe;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  stripe = installFakeStripe();
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

async function holdOn(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);
  const { booking } = await bookingState(db, hold.bookingId);
  if (!booking.holdExpiresAt) throw new Error("the mock provider granted no expiry");

  return { listingId, userId, quoteId: quote.quoteId, hold, booking };
}

describe("hold expiry", () => {
  it("releases a lapsed hold at the provider and puts the week back on sale", async () => {
    const { db } = test;
    const { listingId, userId, quoteId, hold, booking } = await holdOn("lapsed");
    const cancel = vi.spyOn(inventory, "cancelOption");
    const expiresAt = booking.holdExpiresAt?.getTime() ?? 0;

    await sweepExpiries(db, inventory, new Date(expiresAt - HOUR));
    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("OPTION_HELD");
    expect(cancel).not.toHaveBeenCalled();

    const result = await sweepExpiries(db, inventory, new Date(expiresAt + HOUR));

    expect(result.holdsExpired).toBeGreaterThanOrEqual(1);
    expect(result.releaseFailures).toEqual([]);
    expect(cancel).toHaveBeenCalledWith({
      providerReservationId: booking.providerReservationId,
      securityToken: booking.providerReservationUuid,
    });

    const state = await bookingState(db, hold.bookingId);
    expect(state.booking.status).toBe("OPTION_EXPIRED");
    expect(state.quote?.status).toBe("consumed");
    expect(state.events.at(-1)).toMatchObject({
      kind: "option_released",
      providerReference: booking.providerOptionId,
      payload: { released: true },
    });
    expect(await weekOnSale(db, listingId)).toBe(true);

    await expect(confirmCheckout(db, userId, hold.bookingId, "deposit")).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "NOT_PAYABLE" },
    });
    await expect(holdQuote(db, inventory, userId, quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "HOLD_NEVER_HELD" },
    });

    await sweepExpiries(db, inventory, new Date(expiresAt + 2 * HOUR));
    expect(cancel).toHaveBeenCalledTimes(1);
    cancel.mockRestore();
  });

  it("expires the booking even when the provider refuses the release", async () => {
    const { db } = test;
    const { hold, booking } = await holdOn("stubborn");
    vi.spyOn(inventory, "cancelOption").mockRejectedValueOnce(
      new TransientError("provider timed out"),
    );

    const result = await sweepExpiries(
      db,
      inventory,
      new Date((booking.holdExpiresAt?.getTime() ?? 0) + HOUR),
    );

    expect(result.releaseFailures).toContainEqual({
      bookingId: hold.bookingId,
      message: "provider timed out",
    });

    const state = await bookingState(db, hold.bookingId);
    expect(state.booking.status).toBe("OPTION_EXPIRED");
    expect(state.events.at(-1)).toMatchObject({
      kind: "option_released",
      payload: { released: false, error: "provider timed out" },
    });
  });
});

describe("abandoned payment expiry", () => {
  it("reaps a declined checkout nobody retried and releases its option", async () => {
    const { db } = test;
    const { listingId, userId, hold, booking } = await holdOn("abandoned");
    await confirmCheckout(db, userId, hold.bookingId, "deposit");
    const [opened] = (await bookingState(db, hold.bookingId)).payments;
    const pi = opened?.stripePaymentIntentId ?? "";

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.payment_failed", stripe.settle(pi, "requires_payment_method")),
    );
    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("PAYMENT_FAILED");

    const cancel = vi.spyOn(inventory, "cancelOption");

    await sweepExpiries(db, inventory, new Date(Date.now() + 4 * DAY));
    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("PAYMENT_FAILED");

    const result = await sweepExpiries(db, inventory, new Date(Date.now() + 6 * DAY));

    expect(result.paymentsAbandoned).toBeGreaterThanOrEqual(1);
    expect(cancel).toHaveBeenCalledWith({
      providerReservationId: booking.providerReservationId,
      securityToken: booking.providerReservationUuid,
    });

    const state = await bookingState(db, hold.bookingId);
    expect(state.booking).toMatchObject({
      status: "OPTION_EXPIRED",
      cancelReason: "Payment was never completed",
    });
    expect(state.events.at(-1)).toMatchObject({
      kind: "option_released",
      payload: { released: true, reason: "payment_abandoned" },
    });
    expect(await weekOnSale(db, listingId)).toBe(true);
    cancel.mockRestore();
  });
});
