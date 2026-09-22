import "../test-support/checkout-env";

import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedBookingWorld, seedYacht, WEEK_END, WEEK_START } from "../test-support/booking-world";
import { createQuote } from "./quote";

/*
 * Company 225, West Wind: the optional Charter Pack (250) bundles Bed linen and Cleaning, and
 * every offer bills that Cleaning as an obligatory 100 paid at the base.
 */
const PACK = "4475696750000100225";
const BED_LINEN = "1488975580000100225";
const CLEANING = "26877460000100225";

let test: TestDatabase;
let inventory: MockInventoryProvider;
let listingId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  const seeded = await seedYacht(test.db, "westwind");
  listingId = seeded.listingId;

  const extra = {
    source: "booking_manager",
    kind: "service" as const,
    listingId,
    listingOfferId: seeded.offerId,
    priceCurrency: "EUR",
    priceMeasure: "PER_BOOKING",
  };
  await test.db.insert(providerExtraCatalogue).values([
    {
      ...extra,
      externalId: PACK,
      name: "Charter Pack",
      obligatory: false,
      priceMinor: 25_000,
      includedExternalIds: [BED_LINEN, CLEANING],
    },
    { ...extra, externalId: BED_LINEN, name: "Bed linen", obligatory: false, priceMinor: 500 },
    { ...extra, externalId: CLEANING, name: "Cleaning", obligatory: true, priceMinor: 10_000 },
  ]);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await test?.drop();
});

/** The mock's quote with the obligatory Cleaning line the BM adapter puts on every offer. */
function offerBillsCleaning() {
  const original = inventory.getQuote.bind(inventory);
  vi.spyOn(inventory, "getQuote").mockImplementationOnce(async (request) => {
    const priced = await original(request);
    return {
      ...priced,
      lines: [
        ...priced.lines,
        {
          code: `service:${CLEANING}`,
          label: "Cleaning",
          amount: { amountMinor: 10_000, currency: "EUR" },
          payWhen: "at_check_in",
          kind: "extra",
          group: "mandatory",
        },
      ],
    };
  });
}

async function quoteRequesting(requestedExtras: string[]) {
  offerBillsCleaning();
  const priced = await createQuote(
    test.db,
    inventory,
    {
      listingId,
      checkIn: WEEK_START,
      checkOut: WEEK_END,
      guests: 4,
      extras: [],
      currency: "EUR",
      requestedExtras,
    },
    null,
  );
  return priced.lines
    .filter((line) => line.group === "requested")
    .map((line) => [line.code, line.amount.amountMinor, line.payWhen]);
}

describe("a requested Booking Manager pack", () => {
  it("adds only what the offer does not bill already", async () => {
    expect(await quoteRequesting([`service:${PACK}`])).toEqual([
      [`service:${PACK}`, 15_000, "at_check_in"],
    ]);
  });

  it("gives an extra the pack contains no line of its own", async () => {
    expect(await quoteRequesting([`service:${PACK}`, `service:${BED_LINEN}`])).toEqual([
      [`service:${PACK}`, 15_000, "at_check_in"],
    ]);
  });

  it("prices the same extra in full when the pack is not requested", async () => {
    expect(await quoteRequesting([`service:${BED_LINEN}`])).toEqual([
      [`service:${BED_LINEN}`, 500, "at_check_in"],
    ]);
  });
});
