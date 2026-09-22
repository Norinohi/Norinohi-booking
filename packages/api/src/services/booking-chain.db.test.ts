import "../test-support/checkout-env";

import { quote as quoteTable } from "@yacht-charter/db/schema/quote";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { SlotUnavailableError, TransientError } from "@yacht-charter/providers/shared/errors";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
  webhookRow,
  weekOnSale,
} from "../test-support/booking-world";
import {
  deliver,
  eventBody,
  installFakeStripe,
  type FakeStripe,
} from "../test-support/fake-stripe";
import { getBooking, getCheckoutStatus } from "./booking";
import { confirmCheckout } from "./payment";
import { handleStripeWebhook } from "./stripe-webhook";

/*
 * The card checkout from a live quote to a confirmed charter, against a real schema, the mock
 * provider and a Stripe that never leaves the process.
 *
 *   happy        quote, hold, deposit intent, authorization, capture, settlement
 *   idempotent   every event delivered twice, and a delivery that died before it finished
 *   declined     a declined card and a lapsed authorization, both left retryable
 *   refused      the provider says no after the card was authorized: the hold is released
 *
 * The deposit is half the charter rate (350,000); the mock's transit log is paid at the base.
 */

const DEPOSIT_MINOR = 175_000;

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

/** A customer on a fresh yacht, holding its week and paying the deposit. */
async function checkoutOn(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  const quote = await quoteWeek(db, inventory, listingId, userId);
  const hold = await holdQuote(db, inventory, userId, quote.quoteId);
  await confirmCheckout(db, userId, hold.bookingId, "deposit");
  const [paymentRow] = (await bookingState(db, hold.bookingId)).payments;
  if (!paymentRow?.stripePaymentIntentId) throw new Error("checkout recorded no intent");

  return { listingId, userId, hold, pi: paymentRow.stripePaymentIntentId };
}

describe("happy path: quote, hold, checkout, webhook, confirmation", () => {
  let listingId: string;
  let userId: string;
  let bookingId: string;
  let intentId: string;

  it("prices the week live and freezes the quote", async () => {
    const { db } = test;
    ({ listingId } = await seedYacht(db, "happy"));
    userId = await seedCustomer(db, "usr_happy");

    const quote = await quoteWeek(db, inventory, listingId, userId);

    expect(quote).toMatchObject({
      provider: "mock",
      total: { amountMinor: 375_000, currency: "EUR" },
      deposit: { amountMinor: DEPOSIT_MINOR },
      paymentPolicy: { mode: "deposit", depositPct: 0.5 },
    });
    expect(await weekOnSale(db, listingId)).toBe(true);

    const hold = await holdQuote(db, inventory, userId, quote.quoteId);
    bookingId = hold.bookingId;

    expect(hold).toMatchObject({ status: "OPTION_HELD", optionHeld: true });

    const state = await bookingState(db, bookingId);
    expect(state.quote?.status).toBe("consumed");
    expect(state.booking).toMatchObject({
      status: "OPTION_HELD",
      provider: "mock",
      listingOfferId: "off_happy",
      totalMinor: 375_000,
      providerStatus: "option_held",
    });
    expect(state.booking.providerOptionId).toMatch(/^opt_qte_mock_happy_/);
    expect(state.booking.holdExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(state.events.map((event) => event.kind)).toEqual(["option_created"]);
    expect(state.outbox.map((message) => message.kind)).toEqual(["booking_received"]);
    expect(await weekOnSale(db, listingId)).toBe(false);
  });

  it("opens a manual-capture deposit intent and moves to PAYMENT_PENDING", async () => {
    const { db } = test;
    stripe.create.mockClear();

    const checkout = await confirmCheckout(db, userId, bookingId, "deposit");

    expect(checkout).toMatchObject({
      status: "PAYMENT_PENDING",
      kind: "deposit",
      amount: { amountMinor: DEPOSIT_MINOR, currency: "EUR" },
    });
    expect(checkout.clientSecret).toMatch(/_secret_suite$/);
    expect(stripe.create).toHaveBeenCalledTimes(1);
    expect(stripe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: DEPOSIT_MINOR,
        currency: "eur",
        capture_method: "manual",
        metadata: expect.objectContaining({ bookingId, kind: "deposit" }),
      }),
      { idempotencyKey: `pay:${bookingId}:deposit:${DEPOSIT_MINOR}` },
    );

    const state = await bookingState(db, bookingId);
    expect(state.booking.status).toBe("PAYMENT_PENDING");
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      kind: "deposit",
      amountMinor: DEPOSIT_MINOR,
      status: "requires_payment",
    });
    expect(state.schedules).toMatchObject([{ kind: "deposit", status: "pending" }]);
    intentId = state.payments[0]?.stripePaymentIntentId ?? "";
    expect(intentId).toMatch(/^pi_suite_/);
  });

  it("confirms with the provider and captures once the card is authorized", async () => {
    const { db } = test;
    const confirm = vi.spyOn(inventory, "confirmBooking");
    stripe.capture.mockClear();
    /* The base pair the option was opened on travels to the confirm with it. */
    const route = { startBaseId: "31404981", endBaseId: "2206479" };
    const quoteId = (await bookingState(db, bookingId)).quote?.id ?? "";
    await db.update(quoteTable).set({ route }).where(eq(quoteTable.id, quoteId));

    const body = eventBody(
      "payment_intent.amount_capturable_updated",
      stripe.settle(intentId, "requires_capture"),
    );
    const outcome = await deliver(db, inventory, stripe, body);

    expect(outcome).toEqual({
      handled: true,
      eventId: expect.stringMatching(/^evt_suite_/),
      duplicate: false,
      note: undefined,
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ route }));
    expect(stripe.capture).toHaveBeenCalledWith(intentId, undefined, {
      idempotencyKey: `capture:${intentId}`,
    });

    const state = await bookingState(db, bookingId);
    expect(state.booking).toMatchObject({ status: "CONFIRMED", providerStatus: "confirmed" });
    expect(state.booking.confirmedAt).toBeInstanceOf(Date);
    expect(state.booking.providerReservationId).toMatch(/^res_qte_mock_happy_/);
    expect(state.payments[0]).toMatchObject({ status: "authorized" });
    expect(state.events.map((event) => event.kind)).toEqual([
      "option_created",
      "confirm_succeeded",
    ]);

    if (!outcome.handled) throw new Error("unreachable");
    const [recorded] = await webhookRow(db, outcome.eventId);
    expect(recorded?.processedAt).toBeInstanceOf(Date);
    expect(recorded?.error).toBeNull();
    confirm.mockRestore();
  });

  it("settles the payment on payment_intent.succeeded without committing twice", async () => {
    const { db } = test;
    const confirm = vi.spyOn(inventory, "confirmBooking");

    const body = eventBody("payment_intent.succeeded", stripe.settle(intentId, "succeeded"));
    const outcome = await deliver(db, inventory, stripe, body);

    expect(outcome).toMatchObject({ handled: true, duplicate: false });
    expect(confirm).not.toHaveBeenCalled();

    const state = await bookingState(db, bookingId);
    expect(state.booking.status).toBe("CONFIRMED");
    expect(state.payments[0]).toMatchObject({ status: "succeeded" });
    expect(state.payments[0]?.paidAt).toBeInstanceOf(Date);
    expect(state.schedules).toMatchObject([{ kind: "deposit", status: "paid" }]);
    expect(await weekOnSale(db, listingId)).toBe(false);

    expect(await getCheckoutStatus(db, userId, bookingId)).toMatchObject({
      status: "CONFIRMED",
      failureReason: null,
    });
    confirm.mockRestore();
  });

  it("refuses to open a second deposit on the confirmed booking", async () => {
    await expect(confirmCheckout(test.db, userId, bookingId, "deposit")).rejects.toMatchObject({
      kind: "CONFLICT",
      data: { code: "ALREADY_PAID" },
    });
  });
});

describe("webhook idempotency", () => {
  it("applies a redelivered authorization and settlement exactly once", async () => {
    const { db } = test;
    const { hold, pi } = await checkoutOn("twice");
    const confirm = vi.spyOn(inventory, "confirmBooking");
    stripe.capture.mockClear();

    const authorized = eventBody(
      "payment_intent.amount_capturable_updated",
      stripe.settle(pi, "requires_capture"),
    );
    await deliver(db, inventory, stripe, authorized);
    const afterFirst = await bookingState(db, hold.bookingId);

    const again = await deliver(db, inventory, stripe, authorized);

    expect(again).toMatchObject({ handled: true, duplicate: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(stripe.capture).toHaveBeenCalledTimes(1);
    expect(withoutOutbox(await bookingState(db, hold.bookingId))).toEqual(
      withoutOutbox(afterFirst),
    );

    const succeeded = eventBody("payment_intent.succeeded", stripe.settle(pi, "succeeded"));
    await deliver(db, inventory, stripe, succeeded);
    const settled = await bookingState(db, hold.bookingId);

    expect(await deliver(db, inventory, stripe, succeeded)).toMatchObject({ duplicate: true });
    expect(withoutOutbox(await bookingState(db, hold.bookingId))).toEqual(withoutOutbox(settled));
    expect(settled.payments.map((row) => row.status)).toEqual(["succeeded"]);

    if (!again.handled) throw new Error("unreachable");
    expect(await webhookRow(db, again.eventId)).toHaveLength(1);
    confirm.mockRestore();
  });

  it("re-applies a delivery that was recorded but failed before it finished", async () => {
    const { db } = test;
    const { hold, pi } = await checkoutOn("retried");
    stripe.capture.mockClear();
    stripe.capture.mockRejectedValueOnce(new Error("Stripe is unreachable"));

    const eventId = "evt_suite_capture_retry";
    const body = eventBody(
      "payment_intent.amount_capturable_updated",
      stripe.settle(pi, "requires_capture"),
      eventId,
    );
    await expect(deliver(db, inventory, stripe, body)).rejects.toThrow("Stripe is unreachable");

    const [unfinished] = await webhookRow(db, eventId);
    expect(unfinished).toMatchObject({ processedAt: null, error: "Stripe is unreachable" });
    /* The provider commit landed before the capture failed, and is not repeated below. */
    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("CONFIRMED");

    const confirm = vi.spyOn(inventory, "confirmBooking");
    const retried = await deliver(db, inventory, stripe, body);

    expect(retried).toMatchObject({ handled: true, duplicate: false });
    expect(confirm).not.toHaveBeenCalled();
    expect(stripe.capture).toHaveBeenCalledTimes(2);
    expect(stripe.intents.get(pi)?.status).toBe("succeeded");

    const [finished] = await webhookRow(db, eventId);
    expect(finished?.processedAt).toBeInstanceOf(Date);
    expect(finished?.error).toBeNull();
    confirm.mockRestore();
  });
});

describe("payment failure", () => {
  it("leaves a declined card retryable at PAYMENT_FAILED, still holding the week", async () => {
    const { db } = test;
    const { listingId, userId, hold, pi } = await checkoutOn("declined");
    const confirm = vi.spyOn(inventory, "confirmBooking");

    const declined = stripe.settle(pi, "requires_payment_method");
    const outcome = await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.payment_failed", {
        ...declined,
        last_payment_error: { type: "card_error", message: "Your card was declined." },
      }),
    );

    expect(outcome).toMatchObject({ handled: true, duplicate: false });
    expect(confirm).not.toHaveBeenCalled();

    const state = await bookingState(db, hold.bookingId);
    expect(state.booking.status).toBe("PAYMENT_FAILED");
    expect(state.payments).toMatchObject([
      { status: "failed", failureReason: "Your card was declined." },
    ]);
    expect(state.booking.providerOptionId).not.toBeNull();
    expect(await weekOnSale(db, listingId)).toBe(false);
    expect(await getCheckoutStatus(db, userId, hold.bookingId)).toMatchObject({
      status: "PAYMENT_FAILED",
      failureReason: "Your card was declined.",
    });
    confirm.mockRestore();
  });

  it("confirms a retry that authorizes after a declined card", async () => {
    const { db } = test;
    const { userId, hold, pi } = await checkoutOn("retry");

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.payment_failed", stripe.settle(pi, "requires_payment_method")),
    );
    const retry = await confirmCheckout(db, userId, hold.bookingId, "deposit");
    expect(retry.clientSecret).toBe(`${pi}_secret_suite`);

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.amount_capturable_updated", stripe.settle(pi, "requires_capture")),
    );

    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("CONFIRMED");
  });

  it("treats a lapsed authorization as a failed payment rather than a cancelled booking", async () => {
    const { db } = test;
    const { hold, pi } = await checkoutOn("lapsed");

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.canceled", stripe.settle(pi, "canceled")),
    );

    const state = await bookingState(db, hold.bookingId);
    expect(state.booking.status).toBe("PAYMENT_FAILED");
    expect(state.payments).toMatchObject([
      {
        status: "failed",
        failureReason: "Authorization expired before the operator confirmed",
      },
    ]);
  });

  it("ignores an event for an intent no booking opened", async () => {
    const { db } = test;
    const { hold, pi } = await checkoutOn("stranger");
    const before = await bookingState(db, hold.bookingId);

    const outcome = await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.payment_failed", {
        ...stripe.settle(pi, "canceled"),
        id: "pi_unknown",
      }),
    );

    expect(outcome).toMatchObject({ handled: true, duplicate: false });
    expect(withoutOutbox(await bookingState(db, hold.bookingId))).toEqual(withoutOutbox(before));
  });

  it("refuses a webhook whose signature does not verify", async () => {
    const { db } = test;
    const { pi } = await checkoutOn("forged");
    const eventId = "evt_suite_forged";
    const body = eventBody("payment_intent.succeeded", stripe.settle(pi, "succeeded"), eventId);

    const outcome = await handleStripeWebhook(db, inventory, body, "t=1,v1=forged");

    expect(outcome).toMatchObject({ handled: false });
    expect(await webhookRow(db, eventId)).toHaveLength(0);
  });
});

describe("provider refuses after the card was authorized", () => {
  it("releases the authorization and closes the booking without charging", async () => {
    const { db } = test;
    const { listingId, hold, pi } = await checkoutOn("refused");
    vi.spyOn(inventory, "confirmBooking").mockRejectedValueOnce(
      new SlotUnavailableError("Yacht already booked for this period"),
    );
    stripe.capture.mockClear();
    stripe.cancel.mockClear();

    const outcome = await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.amount_capturable_updated", stripe.settle(pi, "requires_capture")),
    );

    expect(outcome).toMatchObject({ handled: true, duplicate: false, note: expect.any(String) });
    expect(stripe.capture).not.toHaveBeenCalled();
    expect(stripe.cancel).toHaveBeenCalledWith(pi, { cancellation_reason: "abandoned" });

    const refused = await bookingState(db, hold.bookingId);
    expect(refused.booking.status).toBe("REFUND_PENDING");
    expect(refused.booking.cancelReason).toMatch(/no longer available/);
    expect(refused.payments).toMatchObject([{ status: "failed" }]);
    expect(refused.events.map((event) => event.kind)).toEqual(["option_created", "confirm_failed"]);

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.canceled", stripe.settle(pi, "canceled")),
    );

    expect((await bookingState(db, hold.bookingId)).booking.status).toBe("REFUNDED");
    expect(await weekOnSale(db, listingId)).toBe(true);
  });
});

/*
 * A timeout on the confirmation says nothing about whether the charter exists: the vendor may
 * have fixed it before the answer was lost. Refunding it, as a refusal is, gave the money back
 * on a charter the operator was holding.
 */
describe("provider does not answer the confirmation", () => {
  it("neither captures nor releases, and leaves the booking for reconcile", async () => {
    const { db } = test;
    const { listingId, hold, pi } = await checkoutOn("silent");
    vi.spyOn(inventory, "confirmBooking").mockRejectedValueOnce(
      new TransientError("NauSYS createBooking timed out"),
    );
    stripe.capture.mockClear();
    stripe.cancel.mockClear();

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.amount_capturable_updated", stripe.settle(pi, "requires_capture")),
    );

    expect(stripe.capture).not.toHaveBeenCalled();
    expect(stripe.cancel).not.toHaveBeenCalled();

    const pending = await bookingState(db, hold.bookingId);
    expect(pending.booking.status).toBe("CONFIRMING");
    expect(pending.events.map((event) => event.kind)).toEqual(["option_created", "confirm_failed"]);
    expect(await weekOnSale(db, listingId)).toBe(false);
  });
});

/*
 * Booking Manager can answer its confirm with the reservation still an option. That is neither a
 * confirmation nor a refusal, so the booking waits in CONFIRMING like a timeout does.
 */
describe("provider answers the confirmation without confirming", () => {
  it("neither marks it confirmed nor refunds it", async () => {
    const { db } = test;
    const { listingId, hold, pi } = await checkoutOn("unconfirmed");
    const confirmBooking = inventory.confirmBooking.bind(inventory);
    vi.spyOn(inventory, "confirmBooking").mockImplementationOnce(async (request) => ({
      ...(await confirmBooking(request)),
      status: "option_held",
    }));
    stripe.capture.mockClear();
    stripe.cancel.mockClear();

    await deliver(
      db,
      inventory,
      stripe,
      eventBody("payment_intent.amount_capturable_updated", stripe.settle(pi, "requires_capture")),
    );

    expect(stripe.capture).not.toHaveBeenCalled();
    expect(stripe.cancel).not.toHaveBeenCalled();
    const pending = await bookingState(db, hold.bookingId);
    expect(pending.booking.status).toBe("CONFIRMING");
    expect(pending.events.at(-1)).toMatchObject({
      kind: "confirm_failed",
      payload: { indeterminate: true, providerStatus: "option_held" },
    });
    expect(await weekOnSale(db, listingId)).toBe(false);
  });
});

/*
 * Booking Manager answers the option with the operator's crew-list page and with what we owe the
 * operator, and the confirmation with the agency twin's id. The booking keeps each, and a
 * confirmation that states less does not take away what the option carried.
 */
describe("what the provider states on the reservation", () => {
  it("keeps the crew-list page, the operator's settlement and the twin id", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "settlement");
    const userId = await seedCustomer(db, "usr_settlement");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const settlement = {
      currency: "EUR",
      netMinor: 144_500,
      plan: [{ dueDate: "2026-09-29", amountMinor: 144_500 }],
      terms: "50% after booking",
    };
    const link = "https://www.booking-manager.com/cbm/servlet/cbm?fview=crew_editor";

    const createOption = inventory.createOption.bind(inventory);
    vi.spyOn(inventory, "createOption").mockImplementationOnce(async (draft) => ({
      ...(await createOption(draft)),
      crewListLink: link,
      operatorSettlement: settlement,
    }));
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);
    await confirmCheckout(db, userId, hold.bookingId, "deposit");
    const [paymentRow] = (await bookingState(db, hold.bookingId)).payments;
    if (!paymentRow?.stripePaymentIntentId) throw new Error("checkout recorded no intent");

    expect((await bookingState(db, hold.bookingId)).booking).toMatchObject({
      crewListLink: link,
      operatorSettlement: settlement,
      providerAgencyReservationId: null,
    });

    const confirmBooking = inventory.confirmBooking.bind(inventory);
    vi.spyOn(inventory, "confirmBooking").mockImplementationOnce(async (request) => ({
      ...(await confirmBooking(request)),
      providerAgencyReservationId: "8295147120000107113",
    }));
    await deliver(
      db,
      inventory,
      stripe,
      eventBody(
        "payment_intent.amount_capturable_updated",
        stripe.settle(paymentRow.stripePaymentIntentId, "requires_capture"),
      ),
    );

    expect((await bookingState(db, hold.bookingId)).booking).toMatchObject({
      status: "CONFIRMED",
      crewListLink: link,
      operatorSettlement: settlement,
      providerAgencyReservationId: "8295147120000107113",
    });
  });
});

/*
 * The booking pages read check-in and check-out off the snapshot. It starts from the base, whose
 * times one sync fills for every fleet at the marina, so the option's own are written over them.
 */
describe("handover times", () => {
  it("keeps the times the provider put on the option", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "handover");
    const userId = await seedCustomer(db, "usr_handover");
    const quote = await quoteWeek(db, inventory, listingId, userId);

    const createOption = inventory.createOption.bind(inventory);
    vi.spyOn(inventory, "createOption").mockImplementationOnce(async (draft) => ({
      ...(await createOption(draft)),
      checkInTime: "17:00",
      checkOutTime: "09:00",
    }));
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);

    const { booking: row } = await bookingState(db, hold.bookingId);
    expect(row.commercialSnapshot).toMatchObject({ checkInTime: "17:00", checkOutTime: "09:00" });

    const detail = await getBooking(db, userId, hold.bookingId);
    expect(detail.checkIn).toBe(`${quote.checkIn}T17:00:00.000Z`);
    expect(detail.checkOut).toBe(`${quote.checkOut}T09:00:00.000Z`);
  });

  it("keeps the base's times where the option states none", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "handoverbase");
    const userId = await seedCustomer(db, "usr_handoverbase");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);

    const { booking: row } = await bookingState(db, hold.bookingId);
    expect(row.commercialSnapshot).toMatchObject({ checkInTime: null, checkOutTime: null });
  });

  it("takes the offer's times where the option states none", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "handoveroffer");
    const userId = await seedCustomer(db, "usr_handoveroffer");

    const getQuote = inventory.getQuote.bind(inventory);
    vi.spyOn(inventory, "getQuote").mockImplementationOnce(async (request) => ({
      ...(await getQuote(request)),
      checkInTime: "17:00",
      checkOutTime: "08:00",
    }));
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);

    const { booking: row } = await bookingState(db, hold.bookingId);
    expect(row.commercialSnapshot).toMatchObject({ checkInTime: "17:00", checkOutTime: "08:00" });
  });
});

/* The outbox drain runs on its own after a hold, so its rows are not the chain's to compare. */
function withoutOutbox(state: Awaited<ReturnType<typeof bookingState>>) {
  return {
    booking: state.booking,
    quote: state.quote,
    payments: state.payments,
    schedules: state.schedules,
    events: state.events,
  };
}
