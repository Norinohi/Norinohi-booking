import "../test-support/checkout-env";

import { call } from "@orpc/server";
import { auditLog } from "@yacht-charter/db/schema/admin";
import { booking } from "@yacht-charter/db/schema/booking";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { TransientError } from "@yacht-charter/providers/shared/errors";
import { and, eq, sql } from "drizzle-orm";
import { parseError } from "evlog";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import { adminProcedure, publicProcedure } from "../index";
import {
  bookingState,
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";
import {
  deliver,
  eventBody,
  installFakeStripe,
  type FakeStripe,
} from "../test-support/fake-stripe";
import { cancelBooking } from "./booking";
import { recordErrorInAudit } from "./error-audit";
import { confirmCheckout } from "./payment";

/*
 * What reaches `audit_log` as `action = error`, and what does not:
 *
 *   staff      any failure past the role check, with the staff user as actor
 *   server     a 5xx from any procedure, public ones included; a visitor's 4xx is not written
 *   provider   a vendor refusing a hold or a release, against the booking
 *   webhook    a Stripe event whose handler threw
 *   guard      one row a minute per source, operation, code, entity and actor
 *   isolation  a failing audit write leaves the original error exactly as thrown
 */

type Session = NonNullable<Context["session"]>;

let test: TestDatabase;
let inventory: MockInventoryProvider;
let stripe: FakeStripe;
let staffId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  stripe = installFakeStripe();
  staffId = await seedCustomer(test.db, "usr_errstaff");
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

function contextFor(user: { id: string; role: string } | null): Context {
  // SAFETY: the middlewares under test read only `user.id` and `user.role`.
  const session = user
    ? Object.assign({} as Session, { user: Object.assign({} as Session["user"], user) })
    : null;
  return { auth: null, db: test.db, provider: inventory, session };
}

function errorRows(entityId: string) {
  return test.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, "error"), eq(auditLog.entityId, entityId)));
}

describe("procedures", () => {
  it("records a refused staff action with the staff user as actor and the redacted input", async () => {
    const procedure = adminProcedure.handler(() => {
      throw new ConflictError({ message: "Already merged", data: { code: "ALREADY_MERGED" } });
    });

    await expect(
      call(
        procedure,
        { candidateId: "dup_1", password: "hunter2" },
        {
          context: contextFor({ id: staffId, role: "staff" }),
          path: ["admin", "match", "merge"],
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", data: { code: "ALREADY_MERGED" } });

    expect(await errorRows("admin.match.merge")).toEqual([
      expect.objectContaining({
        actorUserId: staffId,
        entityType: "procedure",
        metadata: expect.objectContaining({
          source: "admin_action",
          operation: "admin.match.merge",
          kind: "CONFLICT",
          code: "ALREADY_MERGED",
          status: 409,
          message: "Already merged",
          context: { input: { candidateId: "dup_1", password: "[redacted]" } },
        }),
      }),
    ]);
  });

  it("writes a staff 5xx once, not again as a server error", async () => {
    const procedure = adminProcedure.handler(() => {
      throw new Error("unexpected");
    });

    await expect(
      call(procedure, undefined, {
        context: contextFor({ id: staffId, role: "admin" }),
        path: ["admin", "booking", "refund"],
      }),
    ).rejects.toThrow();

    const rows = await errorRows("admin.booking.refund");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({ source: "admin_action", status: 500 });
  });

  it("does not record a visitor's 4xx, or a non-staff caller refused at the role check", async () => {
    const lookup = publicProcedure.handler(() => {
      throw new NotFoundError({ message: "Unknown listing" });
    });
    await expect(
      call(lookup, undefined, { context: contextFor(null), path: ["listings", "detail"] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const admin = adminProcedure.handler(() => "ok");
    await expect(
      call(admin, undefined, {
        context: contextFor({ id: "usr_visitor", role: "user" }),
        path: ["admin", "faq", "list"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await errorRows("listings.detail")).toEqual([]);
    expect(await errorRows("admin.faq.list")).toEqual([]);
  });

  it("records an unexpected 5xx from a public procedure without an actor", async () => {
    const procedure = publicProcedure.handler(() => {
      throw new Error("pool exhausted");
    });

    await expect(
      call(
        procedure,
        { q: "split" },
        { context: contextFor(null), path: ["charterSearch", "results"] },
      ),
    ).rejects.toThrow("pool exhausted");

    expect(await errorRows("charterSearch.results")).toEqual([
      expect.objectContaining({
        actorUserId: null,
        metadata: expect.objectContaining({
          source: "server",
          errorName: "Error",
          status: 500,
          message: "pool exhausted",
          context: { input: { q: "split" } },
        }),
      }),
    ]);
  });

  it("rethrows the original error when the audit write itself fails", async () => {
    const original = new Error("the real failure");
    const procedure = publicProcedure.handler(() => {
      throw original;
    });
    const insert = vi.spyOn(test.db, "insert").mockImplementationOnce(() => {
      throw new Error("audit_log is unavailable");
    });

    const thrown = await call(procedure, undefined, {
      context: contextFor(null),
      path: ["planner", "suggest"],
    }).catch((error: Error) => error);

    expect(thrown).toBe(original);
    expect(insert).toHaveBeenCalledOnce();
    expect(await errorRows("planner.suggest")).toEqual([]);
    insert.mockRestore();
  });
});

describe("provider failures", () => {
  it("records a refused hold against the booking it was for", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "errhold");
    const userId = await seedCustomer(db, "usr_errhold");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    vi.spyOn(inventory, "createOption").mockRejectedValueOnce(
      new TransientError("NauSYS timed out", { endpoint: "/booking/v6/createOption" }),
    );

    await expect(holdQuote(db, inventory, userId, quote.quoteId)).rejects.toMatchObject({
      kind: "CONFLICT",
    });

    const [held] = await db.select().from(booking).where(eq(booking.quoteId, quote.quoteId));
    if (!held) throw new Error("the refused hold left no booking");
    expect(await errorRows(held.id)).toEqual([
      expect.objectContaining({
        entityType: "booking",
        metadata: expect.objectContaining({
          source: "provider",
          operation: "provider.hold",
          code: "transient",
          message: "NauSYS timed out",
          provider: expect.objectContaining({ errorType: "transient", retryable: true }),
          context: { provider: "mock" },
        }),
      }),
    ]);
  });

  it("records a release the vendor refused when a booking is cancelled", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "errrelease");
    const userId = await seedCustomer(db, "usr_errrelease");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);
    vi.spyOn(inventory, "cancelOption").mockRejectedValueOnce(new TransientError("vendor down"));

    const result = await cancelBooking(db, inventory, hold.bookingId, undefined, {
      userId,
      isAdmin: false,
    });

    expect(result.providerReleased).toBe(false);
    expect(await errorRows(hold.bookingId)).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: "provider",
          operation: "provider.release",
          message: "vendor down",
        }),
      }),
    ]);
  });
});

describe("stripe webhook", () => {
  it("records a handler failure against the event and still rethrows it", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "errhook");
    const userId = await seedCustomer(db, "usr_errhook");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);
    await confirmCheckout(db, userId, hold.bookingId, "deposit");
    const [paymentRow] = (await bookingState(db, hold.bookingId)).payments;
    if (!paymentRow?.stripePaymentIntentId) throw new Error("checkout recorded no intent");
    stripe.capture.mockRejectedValueOnce(new Error("Stripe is unreachable"));

    const eventId = "evt_suite_error_audit";
    const body = eventBody(
      "payment_intent.amount_capturable_updated",
      stripe.settle(paymentRow.stripePaymentIntentId, "requires_capture"),
      eventId,
    );
    await expect(deliver(db, inventory, stripe, body)).rejects.toThrow("Stripe is unreachable");

    expect(await errorRows(eventId)).toEqual([
      expect.objectContaining({
        entityType: "stripe_event",
        actorUserId: null,
        metadata: expect.objectContaining({
          source: "stripe_webhook",
          operation: "stripe.payment_intent.amount_capturable_updated",
          message: "Stripe is unreachable",
          context: { eventType: "payment_intent.amount_capturable_updated" },
        }),
      }),
    ]);
  });
});

describe("flood guard", () => {
  it("writes one row a minute for the same failure, and another once the minute has passed", async () => {
    const { db } = test;
    const entry = {
      source: "job" as const,
      operation: "job.sync-availability",
      entityType: "job",
      entityId: "sync-availability",
      thrown: parseError(new Error("feed down")),
    };

    expect(await recordErrorInAudit(db, entry)).toBe("written");
    expect(await recordErrorInAudit(db, entry)).toBe("suppressed");
    expect(
      await recordErrorInAudit(db, {
        ...entry,
        thrown: parseError(new NotFoundError({ data: { code: "OTHER" } })),
      }),
    ).toBe("written");

    await db
      .update(auditLog)
      .set({ createdAt: sql`now() - interval '2 minutes'` })
      .where(eq(auditLog.entityId, "sync-availability"));

    expect(await recordErrorInAudit(db, entry)).toBe("written");
    expect(await errorRows("sync-availability")).toHaveLength(3);
  });
});
