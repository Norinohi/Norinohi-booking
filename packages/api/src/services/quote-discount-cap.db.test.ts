import "../test-support/checkout-env";

import { discount, discountTarget } from "@yacht-charter/db/schema/discount";
import { quote } from "@yacht-charter/db/schema/quote";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { persistedQuoteSchema } from "../contracts/quote";
import {
  seedBookingWorld,
  seedCustomer,
  seedYacht,
  WEEK_END,
  WEEK_START,
} from "../test-support/booking-world";
import { createQuote } from "./quote";

let test: TestDatabase;
let inventory: MockInventoryProvider;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  const [half] = await test.db
    .insert(discount)
    .values({ name: "Half off", code: "HALF", type: "percentage", valuePct: "50.0000" })
    .returning({ id: discount.id });
  await test.db
    .insert(discountTarget)
    .values({ discountId: half?.id ?? "", targetType: "all", targetId: "all" });
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

/** The mock's own quote, with the provider bound and commission NauSYS would state. */
function boundedAt(maxMinor: number) {
  const original = inventory.getQuote.bind(inventory);
  vi.spyOn(inventory, "getQuote").mockImplementationOnce(async (request) => ({
    ...(await original(request)),
    commission: { amount: { amountMinor: 50_000, currency: "EUR" } },
    maxClientDiscount: { amountMinor: maxMinor, currency: "EUR" },
  }));
}

async function quoteWithCode(slug: string) {
  const { db } = test;
  const { listingId } = await seedYacht(db, slug);
  const userId = await seedCustomer(db, `usr_${slug}`);
  return createQuote(
    db,
    inventory,
    {
      listingId,
      checkIn: WEEK_START,
      checkOut: WEEK_END,
      guests: 4,
      extras: [],
      currency: "EUR",
      discountCode: "HALF",
    },
    userId,
  );
}

/*
 * NauSYS lets an agency discount only out of its commission, up to what the operator allows.
 * A 50% promo on a hull that allows 100 EUR gave away half the charter.
 */
describe("our discounts against the provider's bound", () => {
  it("gives only what the bound leaves, and records what was given", async () => {
    boundedAt(10_000);

    const priced = await quoteWithCode("capped");
    const [row] = await test.db.select().from(quote).where(eq(quote.id, priced.quoteId));

    expect(priced.discountRejected).toBeNull();
    expect(priced.discount?.amountMinor).toBe(10_000);
    expect(row?.clientDiscountMinor).toBe(10_000);
  });

  it("gives nothing where the operator allows nothing", async () => {
    boundedAt(0);

    const priced = await quoteWithCode("none-allowed");

    expect(priced.discount?.amountMinor).toBe(0);
  });

  it("is unbounded where the provider states no bound", async () => {
    const priced = await quoteWithCode("unbounded");

    expect(priced.discount?.amountMinor ?? 0).toBeGreaterThan(10_000);
  });

  /*
   * The offer states the commission gross; NauSYS bounds the discount by it net of VAT, which
   * only it can say. Asked once our discounts take anything, and a tighter answer wins.
   */
  it("gives only what the provider's exact bound allows", async () => {
    boundedAt(50_000);
    const exact = vi.fn(async () => ({ amountMinor: 7_000, currency: "EUR" }));
    Object.assign(inventory, { exactClientDiscountCap: exact });

    const priced = await quoteWithCode("exact");
    Object.assign(inventory, { exactClientDiscountCap: undefined });

    expect(exact).toHaveBeenCalledOnce();
    expect(priced.discount?.amountMinor).toBe(7_000);
  });

  /* A public endpoint: what we earn and may give away never leave the server. */
  it("keeps the commission and the bound out of the answer", async () => {
    boundedAt(10_000);

    const answer = persistedQuoteSchema.parse(await quoteWithCode("private"));

    expect(answer).not.toHaveProperty("commission");
    expect(answer).not.toHaveProperty("maxClientDiscount");
  });
});
