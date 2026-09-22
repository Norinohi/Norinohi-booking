import "../test-support/checkout-env";

import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { quoteOfferAttempt } from "@yacht-charter/db/schema/quote";
import { providerInvoice } from "@yacht-charter/db/schema/provider-invoice";
import type { InventoryProvider, ProviderInvoice } from "@yacht-charter/providers";
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
import { syncProviderInvoices } from "./provider-invoices";

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

function invoicing(invoices: ProviderInvoice[]) {
  const listInvoices: NonNullable<InventoryProvider["listInvoices"]> = async () => invoices;
  Object.assign(inventory, { listInvoices });
}

describe("provider invoices", () => {
  it("files each invoice beside its booking, once, and reports a commission that differs", async () => {
    const { db } = test;
    const { listingId } = await seedYacht(db, "invoiced");
    const userId = await seedCustomer(db, "usr_invoiced");
    const quote = await quoteWeek(db, inventory, listingId, userId);
    const hold = await holdQuote(db, inventory, userId, quote.quoteId);
    const { booking } = await bookingState(db, hold.bookingId);
    const reservationId = booking.providerReservationId;
    if (!reservationId) throw new Error("the hold recorded no reservation id");

    await db
      .update(quoteOfferAttempt)
      .set({ commissionMinor: 12_000, currency: "EUR" })
      .where(
        and(eq(quoteOfferAttempt.quoteId, quote.quoteId), eq(quoteOfferAttempt.outcome, "won")),
      );

    invoicing([
      {
        number: "1/2026",
        issuedOn: "2026-07-18",
        providerReservationId: reservationId,
        currency: "EUR",
        totalMinor: 12_694,
        netMinor: 10_155,
        lines: [
          { code: "AG-COMM-1", label: "Agencijska provizija", netMinor: 10_155, vatRate: 25 },
        ],
      },
      {
        number: "2/2026",
        issuedOn: "2026-07-19",
        providerReservationId: "999999999",
        currency: "EUR",
        totalMinor: 100,
        netMinor: 80,
        lines: [],
      },
    ]);

    const now = new Date("2026-09-22T00:00:00Z");
    const first = await syncProviderInvoices(db, inventory, now, ["mock"]);
    await syncProviderInvoices(db, inventory, now, ["mock"]);

    const rows = await db.select().from(providerInvoice);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.number === "1/2026")?.bookingId).toBe(hold.bookingId);
    expect(rows.find((row) => row.number === "2/2026")?.bookingId).toBeNull();
    expect(first).toMatchObject({ recorded: 2, unmatched: 1, unreachable: [] });
    expect(first.commissionMismatches).toEqual([
      { reference: booking.reference, invoiced: 10_155, quoted: 12_000, currency: "EUR" },
    ]);
  });
});
